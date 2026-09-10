from collections.abc import Mapping, Sequence
from typing import Any

from pymongo import ASCENDING
from pymongo.asynchronous.database import AsyncDatabase

from app.deployments.mongo_repository import COLLECTION_NAME, RETENTION_SECONDS

Index = Mapping[str, Any]
IndexKey = Sequence[tuple[str, int]]


async def required_indexes_present(database: AsyncDatabase) -> bool:
    cursor = await database[COLLECTION_NAME].list_indexes()
    indexes = [index async for index in cursor]
    return (
        _has_index(indexes, [("deployment_id", ASCENDING)], unique=True)
        and _has_index(
            indexes,
            [("updated_at", ASCENDING), ("deployment_id", ASCENDING)],
        )
        and _has_index(
            indexes,
            [("deleted_at", ASCENDING)],
            expireAfterSeconds=RETENTION_SECONDS,
        )
    )


def _has_index(indexes: Sequence[Index], key: IndexKey, **options: object) -> bool:
    return any(
        tuple(index.get("key", {}).items()) == tuple(key)
        and all(index.get(name) == value for name, value in options.items())
        for index in indexes
    )
