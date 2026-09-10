from collections.abc import Mapping
from typing import Any

import pytest
from pymongo.asynchronous.database import AsyncDatabase

from app.deployments.mongo_repository import (
    CHECKPOINT_INDEX,
    COLLECTION_NAME,
    RETENTION_SECONDS,
    MongoDeploymentRepository,
)

pytestmark = pytest.mark.anyio


async def indexes_of(database: AsyncDatabase) -> dict[str, Mapping[str, Any]]:
    cursor = await database[COLLECTION_NAME].list_indexes()
    return {index["name"]: index async for index in cursor}


async def test_creates_every_index_the_service_depends_on(
    database: AsyncDatabase,
) -> None:
    repository = MongoDeploymentRepository(database)

    await repository.ensure_indexes()
    indexes = await indexes_of(database)

    unique = next(i for i in indexes.values() if i["key"] == {"deployment_id": 1})
    checkpoint = indexes[CHECKPOINT_INDEX]
    ttl = next(i for i in indexes.values() if i["key"] == {"deleted_at": 1})

    assert unique.get("unique") is True
    assert checkpoint["key"] == {"updated_at": 1, "deployment_id": 1}
    assert ttl.get("expireAfterSeconds") == RETENTION_SECONDS
    assert any(index["key"] == {"created_at": 1} for index in indexes.values())
    assert any(index["key"] == {"status": 1} for index in indexes.values())


async def test_index_creation_is_repeatable(database: AsyncDatabase) -> None:
    repository = MongoDeploymentRepository(database)

    await repository.ensure_indexes()
    before = set(await indexes_of(database))
    await repository.ensure_indexes()

    assert set(await indexes_of(database)) == before
