from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from httpx import AsyncClient

from app.deployments.memory_repository import InMemoryDeploymentRepository
from app.deployments.models import Deployment
from app.main import create_app
from app.settings import Settings
from tests.conftest import client_for

pytestmark = pytest.mark.anyio

BASE = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


def deployment(offset_seconds: int, deployment_id: UUID) -> Deployment:
    stamp = BASE + timedelta(seconds=offset_seconds)
    return Deployment.model_validate(
        {
            "deployment_id": str(deployment_id),
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
async def client(rows: list[Deployment]) -> AsyncIterator[AsyncClient]:
    app = create_app(
        Settings(mongo_url="mongodb://unused"),
        repository=InMemoryDeploymentRepository(rows),
    )
    async with client_for(app) as http:
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
