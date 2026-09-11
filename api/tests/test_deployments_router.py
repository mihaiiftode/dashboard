from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient
from pymongo.asynchronous.database import AsyncDatabase

from app.deployments.models import Deployment
from app.main import create_app
from app.settings import Settings
from tests.conftest import client_for, store

pytestmark = pytest.mark.anyio

BASE = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


def deployment(
    offset_seconds: int, deployment_id: UUID, revision: int = 1
) -> Deployment:
    stamp = BASE + timedelta(seconds=offset_seconds)
    return Deployment.model_validate(
        {
            "deployment_id": str(deployment_id),
            "revision": revision,
            "version": "1.0.0",
            "status": "active",
            "type": "worker",
            "environment": "staging",
            "attributes": {"name": f"service-{offset_seconds}", "team": "platform"},
            "created_at": BASE.isoformat(),
            "created_by": "engineer@example.com",
            "updated_at": stamp.isoformat(),
            "deleted_at": None,
        }
    )


@pytest.fixture
async def rows() -> list[Deployment]:
    return [deployment(index, uuid4()) for index in range(5)]


@pytest.fixture
async def client(
    settings: Settings, database: AsyncDatabase, rows: list[Deployment]
) -> AsyncIterator[AsyncClient]:
    await store(database, rows)
    async with client_for(create_app(settings)) as http:
        yield http


async def test_lists_every_deployment_in_checkpoint_order(
    client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await client.get("/v1/deployments")

    assert response.status_code == 200
    body = response.json()
    assert [item["deployment_id"] for item in body["items"]] == [
        str(row.deployment_id) for row in rows
    ]
    assert body["checkpoint"] is None


async def test_reconciles_only_missing_ids_without_discarding_soft_deleted_rows(
    client: AsyncClient, rows: list[Deployment]
) -> None:
    missing = str(uuid4())
    await client.delete(f"/v1/deployments/{rows[0].deployment_id}")
    response = await client.post(
        "/v1/deployments/reconcile", json=[str(rows[0].deployment_id), missing]
    )

    assert response.status_code == 200
    assert response.json() == [missing]


async def test_reconciliation_rejects_oversized_batches(client: AsyncClient) -> None:
    response = await client.post(
        "/v1/deployments/reconcile", json=[str(uuid4())] * 1001
    )
    assert response.status_code == 422


async def test_returns_the_next_checkpoint_while_more_remain(
    client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await client.get("/v1/deployments", params={"limit": 2})

    body = response.json()
    assert len(body["items"]) == 2
    assert body["checkpoint"]["deployment_id"] == str(rows[1].deployment_id)
    assert (
        datetime.fromisoformat(body["checkpoint"]["updated_at"]) == rows[1].updated_at
    )


async def test_resumes_from_a_checkpoint(
    client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await client.get(
        "/v1/deployments",
        params={
            "updated_after": rows[1].updated_at.isoformat(),
            "after_id": str(rows[1].deployment_id),
            "limit": 2,
        },
    )

    body = response.json()
    assert [item["deployment_id"] for item in body["items"]] == [
        str(rows[2].deployment_id),
        str(rows[3].deployment_id),
    ]


async def test_walks_every_page_exactly_once(
    client: AsyncClient, rows: list[Deployment]
) -> None:
    seen: list[str] = []
    params: dict[str, str] = {"limit": "2"}
    while True:
        body = (await client.get("/v1/deployments", params=params)).json()
        seen.extend(item["deployment_id"] for item in body["items"])
        if body["checkpoint"] is None:
            break
        params = {
            "limit": "2",
            "updated_after": body["checkpoint"]["updated_at"],
            "after_id": body["checkpoint"]["deployment_id"],
        }

    assert seen == [str(row.deployment_id) for row in rows]


async def test_serves_a_full_document_shape(client: AsyncClient) -> None:
    body = (await client.get("/v1/deployments", params={"limit": 1})).json()

    item = body["items"][0]
    assert set(item) == {
        "deployment_id",
        "revision",
        "version",
        "status",
        "type",
        "environment",
        "attributes",
        "created_at",
        "created_by",
        "updated_at",
        "deleted_at",
    }
    assert item["attributes"] == {"name": "service-0", "team": "platform"}


@pytest.mark.parametrize("limit", ["0", "1001", "many"])
async def test_rejects_a_limit_outside_the_allowed_range(
    client: AsyncClient, limit: str
) -> None:
    response = await client.get("/v1/deployments", params={"limit": limit})

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["errors"][0]["loc"] == ["query", "limit"]


async def test_rejects_a_tiebreaker_without_a_timestamp(client: AsyncClient) -> None:
    response = await client.get("/v1/deployments", params={"after_id": str(uuid4())})

    assert response.status_code == 422
    assert "updated_after" in response.json()["detail"]


async def test_rejects_a_checkpoint_without_timezone(client: AsyncClient) -> None:
    response = await client.get(
        "/v1/deployments",
        params={
            "updated_after": "2026-09-10T12:00:00",
            "after_id": "00000000-0000-4000-8000-000000000001",
        },
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["errors"][0]["loc"] == ["query", "updated_after"]


@pytest.mark.parametrize(
    "updated_after", ["2026-09-10T12:00:00Z", "2026-09-10T12:00:00+02:00"]
)
async def test_accepts_a_checkpoint_carrying_an_offset(
    client: AsyncClient, updated_after: str
) -> None:
    response = await client.get(
        "/v1/deployments",
        params={
            "updated_after": updated_after,
            "after_id": "00000000-0000-4000-8000-000000000001",
        },
    )

    assert response.status_code == 200


async def test_rejects_a_timestamp_without_a_tiebreaker(client: AsyncClient) -> None:
    response = await client.get(
        "/v1/deployments", params={"updated_after": "2026-09-10T12:00:00Z"}
    )

    assert response.status_code == 422
    assert "after_id" in response.json()["detail"]


@pytest.fixture
async def deleted_row() -> Deployment:
    row = deployment(99, uuid4())
    return row.model_copy(update={"deleted_at": datetime.now(UTC)})


@pytest.fixture
async def edit_client(
    settings: Settings,
    database: AsyncDatabase,
    rows: list[Deployment],
    deleted_row: Deployment,
) -> AsyncIterator[AsyncClient]:
    await store(database, [*rows, deleted_row])
    async with client_for(create_app(settings)) as http:
        yield http


def writable_body(name: str = "renamed") -> dict[str, object]:
    return {
        "version": "2.0.0",
        "status": "failed",
        "type": "cron_job",
        "environment": "production",
        "attributes": {"name": name, "region": "eu-west-1"},
    }


async def test_serves_one_deployment_with_a_version_tag(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await edit_client.get(f"/v1/deployments/{rows[0].deployment_id}")

    assert response.status_code == 200
    assert response.json()["deployment_id"] == str(rows[0].deployment_id)
    assert response.headers["etag"] != ""


async def test_returns_not_found_for_an_unknown_deployment(
    edit_client: AsyncClient,
) -> None:
    response = await edit_client.get(f"/v1/deployments/{uuid4()}")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_replaces_a_deployment_when_the_version_tag_matches(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    target = rows[0].deployment_id
    tag = (await edit_client.get(f"/v1/deployments/{target}")).headers["etag"]

    response = await edit_client.put(
        f"/v1/deployments/{target}", json=writable_body(), headers={"If-Match": tag}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["attributes"] == {"name": "renamed", "region": "eu-west-1"}
    assert body["status"] == "failed"
    assert response.headers["etag"] != tag


async def test_replaces_unconditionally_without_a_version_tag(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}", json=writable_body()
    )

    assert response.status_code == 200
    assert response.json()["attributes"]["name"] == "renamed"


async def test_returns_the_winning_deployment_when_the_version_tag_is_stale(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    target = rows[0].deployment_id
    await edit_client.put(f"/v1/deployments/{target}", json=writable_body("first"))

    response = await edit_client.put(
        f"/v1/deployments/{target}",
        json=writable_body(),
        headers={"If-Match": '"1"'},
    )

    assert response.status_code == 412
    assert response.json()["attributes"]["name"] == "first"
    assert response.headers["etag"] == '"2"'


async def test_rejects_an_empty_name(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}", json=writable_body(name="")
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_rejects_a_name_of_only_whitespace(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}", json=writable_body(name="   ")
    )

    assert response.status_code == 422
    assert "name" in response.json()["detail"]


async def test_rejects_an_attribute_key_outside_the_rule(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    body = writable_body()
    body["attributes"] = {"name": "renamed", "Not Allowed": "x"}

    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}", json=body
    )

    assert response.status_code == 422


async def test_rejects_a_field_the_client_may_not_write(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    body = writable_body()
    body["created_by"] = "someone@example.com"

    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}", json=body
    )

    assert response.status_code == 422


async def test_refuses_to_replace_a_deleted_deployment(
    edit_client: AsyncClient, deleted_row: Deployment
) -> None:
    response = await edit_client.put(
        f"/v1/deployments/{deleted_row.deployment_id}", json=writable_body()
    )

    assert response.status_code == 409


async def test_returns_not_found_when_replacing_an_unknown_deployment(
    edit_client: AsyncClient,
) -> None:
    response = await edit_client.put(f"/v1/deployments/{uuid4()}", json=writable_body())

    assert response.status_code == 404


async def test_creates_the_indexes_the_dashboard_relies_on(
    edit_client: AsyncClient, database: AsyncDatabase
) -> None:
    indexes = await database["deployments"].index_information()

    assert [
        name
        for name, spec in indexes.items()
        if spec.get("unique") and spec["key"] == [("deployment_id", 1)]
    ]
    assert [
        name
        for name, spec in indexes.items()
        if spec["key"] == [("updated_at", 1), ("deployment_id", 1)]
    ]
    expiring = [name for name, spec in indexes.items() if "expireAfterSeconds" in spec]
    assert indexes[expiring[0]]["expireAfterSeconds"] == 30 * 24 * 60 * 60


async def test_answers_a_broken_attribute_rule_with_a_problem_per_key(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    body = writable_body()
    body["attributes"] = {"name": "renamed", "oncall": "not-an-email", "Bad Key": "x"}

    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}", json=body
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    problem = response.json()
    assert [error["loc"] for error in problem["errors"]] == [
        ["body", "attributes", "oncall"],
        ["body", "attributes", "Bad Key"],
    ]
    assert problem["errors"][0]["msg"] == "must be an email address"
    assert "oncall" in problem["detail"]


async def test_keeps_the_stored_deployment_when_an_attribute_rule_fails(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    body = writable_body()
    body["attributes"] = {"name": ""}

    await edit_client.put(f"/v1/deployments/{rows[0].deployment_id}", json=body)

    stored = (await edit_client.get(f"/v1/deployments/{rows[0].deployment_id}")).json()
    assert stored["attributes"]["name"] == "service-0"
    assert stored["revision"] == 1


async def test_updates_a_key_the_deployment_already_carries(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    body = writable_body()
    body["attributes"] = {"name": "renamed", "team": "search"}

    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}", json=body
    )

    assert response.json()["attributes"] == {"name": "renamed", "team": "search"}


async def test_deletes_a_deployment_out_of_the_default_scope(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    target = rows[0].deployment_id

    response = await edit_client.delete(f"/v1/deployments/{target}")

    assert response.status_code == 204
    stored = (await edit_client.get(f"/v1/deployments/{target}")).json()
    assert stored["deleted_at"] is not None
    assert stored["revision"] == 2


async def test_refuses_to_delete_a_deployment_twice(
    edit_client: AsyncClient, deleted_row: Deployment
) -> None:
    response = await edit_client.delete(f"/v1/deployments/{deleted_row.deployment_id}")

    assert response.status_code == 404


async def test_returns_not_found_when_deleting_an_unknown_deployment(
    edit_client: AsyncClient,
) -> None:
    assert (await edit_client.delete(f"/v1/deployments/{uuid4()}")).status_code == 404


async def test_restores_a_deleted_deployment_unchanged(
    edit_client: AsyncClient, deleted_row: Deployment
) -> None:
    response = await edit_client.post(
        f"/v1/deployments/{deleted_row.deployment_id}/restore"
    )

    assert response.status_code == 200
    restored = response.json()
    assert restored["deleted_at"] is None
    assert restored["attributes"] == deleted_row.attributes.to_map()
    assert restored["revision"] == 2
    assert response.headers["etag"] == '"2"'


async def test_refuses_to_restore_a_deployment_that_is_not_deleted(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    response = await edit_client.post(
        f"/v1/deployments/{rows[0].deployment_id}/restore"
    )

    assert response.status_code == 409
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_refuses_to_edit_a_deployment_once_it_is_deleted(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    target = rows[0].deployment_id
    await edit_client.delete(f"/v1/deployments/{target}")

    response = await edit_client.put(
        f"/v1/deployments/{target}", json=writable_body("after-delete")
    )

    assert response.status_code == 409


async def test_maps_a_missing_deployment_to_problem_json(client: AsyncClient) -> None:
    response = await client.get(f"/v1/deployments/{uuid4()}")

    assert response.status_code == 404
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["title"] == "Not Found"


async def test_maps_attribute_violations_to_problem_json_with_every_key(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    body = writable_body()
    body["attributes"] = {"name": "  ", "oncall": "not-an-email"}

    response = await edit_client.put(
        f"/v1/deployments/{rows[0].deployment_id}",
        json=body,
        headers={"If-Match": '"1"'},
    )

    assert response.status_code == 422
    assert response.headers["content-type"] == "application/problem+json"
    reported = {tuple(error["loc"]) for error in response.json()["errors"]}
    assert ("body", "attributes", "name") in reported
    assert ("body", "attributes", "oncall") in reported


async def test_answers_a_stale_write_with_the_winner_and_not_problem_json(
    edit_client: AsyncClient, rows: list[Deployment]
) -> None:
    target = rows[0].deployment_id
    await edit_client.put(
        f"/v1/deployments/{target}",
        json=writable_body("first"),
        headers={"If-Match": '"1"'},
    )

    response = await edit_client.put(
        f"/v1/deployments/{target}",
        json=writable_body("second"),
        headers={"If-Match": '"1"'},
    )

    assert response.status_code == 412
    assert response.headers["content-type"] == "application/json"
    assert response.headers["etag"] == '"2"'
    assert response.json()["attributes"]["name"] == "first"
