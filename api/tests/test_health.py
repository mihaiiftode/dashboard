from typing import Any

import pytest
from httpx import AsyncClient
from pymongo import ASCENDING, DESCENDING
from pymongo.asynchronous.database import AsyncDatabase

from app.deployments.mongo_repository import (
    CHECKPOINT_INDEX,
    COLLECTION_NAME,
    RETENTION_SECONDS,
)
from app.main import create_app
from app.settings import Settings
from tests.conftest import client_for

pytestmark = pytest.mark.anyio


async def test_health_reports_ok_when_database_reachable(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_health_reports_unavailable_when_database_unreachable(
    settings: Settings,
) -> None:
    unreachable = settings.model_copy(
        update={"mongo_url": "mongodb://127.0.0.1:1", "mongo_timeout_ms": 200}
    )
    async with client_for(create_app(unreachable)) as client:
        response = await client.get("/health")

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["detail"] == "Database unreachable"


async def test_health_reports_unavailable_when_a_required_index_is_missing(
    settings: Settings, database: AsyncDatabase
) -> None:
    async with client_for(create_app(settings)) as client:
        await database[COLLECTION_NAME].drop_index("deployment_id_1")

        response = await client.get("/health")

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["detail"] == "Required database indexes unavailable"


@pytest.mark.parametrize(
    ("index_name", "keys", "options"),
    [
        ("deployment_id_1", [("deployment_id", ASCENDING)], {}),
        (
            CHECKPOINT_INDEX,
            [("updated_at", DESCENDING), ("deployment_id", ASCENDING)],
            {"name": CHECKPOINT_INDEX},
        ),
        (
            "deleted_at_1",
            [("deleted_at", ASCENDING)],
            {"expireAfterSeconds": RETENTION_SECONDS - 1},
        ),
    ],
)
async def test_health_reports_unavailable_when_a_required_index_is_malformed(
    settings: Settings,
    database: AsyncDatabase,
    index_name: str,
    keys: list[tuple[str, int]],
    options: dict[str, Any],
) -> None:
    async with client_for(create_app(settings)) as client:
        await database[COLLECTION_NAME].drop_index(index_name)
        await database[COLLECTION_NAME].create_index(keys, **options)

        response = await client.get("/health")

    assert response.status_code == 503
    assert response.json()["detail"] == "Required database indexes unavailable"


async def test_health_recovers_when_required_indexes_are_restored(
    settings: Settings, database: AsyncDatabase
) -> None:
    async with client_for(create_app(settings)) as client:
        await database[COLLECTION_NAME].drop_index("deleted_at_1")
        unavailable = await client.get("/health")
        await database[COLLECTION_NAME].create_index(
            [("deleted_at", ASCENDING)], expireAfterSeconds=RETENTION_SECONDS
        )

        recovered = await client.get("/health")

    assert unavailable.status_code == 503
    assert recovered.status_code == 200
    assert recovered.json() == {"status": "ok"}
