from datetime import UTC
from typing import Any
from uuid import UUID

from bson import CodecOptions
from pymongo import ASCENDING, AsyncMongoClient, ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.deployments.models import Checkpoint, Deployment

COLLECTION_NAME = "deployments"
RETENTION_SECONDS = 30 * 24 * 60 * 60
CHECKPOINT_INDEX = "updated_at_deployment_id"
PROJECTION = {"_id": False}


class MongoDeploymentRepository:
    def __init__(self, database: AsyncDatabase) -> None:
        self._collection = database.get_collection(
            COLLECTION_NAME, codec_options=CodecOptions(tz_aware=True, tzinfo=UTC)
        )

    @classmethod
    def from_client(
        cls, client: AsyncMongoClient, database_name: str
    ) -> "MongoDeploymentRepository":
        return cls(client[database_name])

    async def ensure_indexes(self) -> None:
        await self._collection.create_index([("deployment_id", ASCENDING)], unique=True)
        await self._collection.create_index(
            [("updated_at", ASCENDING), ("deployment_id", ASCENDING)],
            name=CHECKPOINT_INDEX,
        )
        await self._collection.create_index(
            [("deleted_at", ASCENDING)], expireAfterSeconds=RETENTION_SECONDS
        )
        await self._collection.create_index([("created_at", ASCENDING)])
        await self._collection.create_index([("status", ASCENDING)])

    async def list_page(self, after: Checkpoint | None, limit: int) -> list[Deployment]:
        cursor = self._collection.find(self._after(after), PROJECTION)
        cursor = cursor.sort(
            [("updated_at", ASCENDING), ("deployment_id", ASCENDING)]
        ).limit(limit)
        return [Deployment.model_validate(document) async for document in cursor]

    async def get(self, deployment_id: UUID) -> Deployment | None:
        document = await self._collection.find_one(
            {"deployment_id": str(deployment_id)}, PROJECTION
        )
        return None if document is None else Deployment.model_validate(document)

    async def replace(
        self, deployment: Deployment, if_revision: int | None
    ) -> Deployment | None:
        criteria: dict[str, Any] = {"deployment_id": str(deployment.deployment_id)}
        if if_revision is not None:
            criteria["revision"] = if_revision
        document = await self._collection.find_one_and_replace(
            criteria,
            deployment.to_document(),
            projection=PROJECTION,
            return_document=ReturnDocument.AFTER,
        )
        return None if document is None else Deployment.model_validate(document)

    @staticmethod
    def _after(after: Checkpoint | None) -> dict[str, Any]:
        if after is None:
            return {}
        return {
            "$or": [
                {"updated_at": {"$gt": after.updated_at}},
                {
                    "updated_at": after.updated_at,
                    "deployment_id": {"$gt": str(after.deployment_id)},
                },
            ]
        }
