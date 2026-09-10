import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from app.deployments.change_feed import ChangePublisher
from app.deployments.models import (
    Attributes,
    Checkpoint,
    Deployment,
    DeploymentPage,
    Writable,
)
from app.deployments.repository import DeploymentRepository

logger = logging.getLogger(__name__)


class DeploymentNotFound(Exception):
    def __init__(self, deployment_id: UUID) -> None:
        super().__init__(f"deployment {deployment_id} does not exist")
        self.deployment_id = deployment_id


class DeploymentDeleted(Exception):
    def __init__(self, deployment_id: UUID) -> None:
        super().__init__(f"deployment {deployment_id} is deleted")
        self.deployment_id = deployment_id


class DeploymentNotDeleted(Exception):
    def __init__(self, deployment_id: UUID) -> None:
        super().__init__(f"deployment {deployment_id} is not deleted")
        self.deployment_id = deployment_id


class StaleWrite(Exception):
    def __init__(self, current: Deployment) -> None:
        super().__init__(f"deployment {current.deployment_id} moved on")
        self.current = current


class DeploymentService:
    def __init__(
        self, repository: DeploymentRepository, changes: ChangePublisher
    ) -> None:
        self._repository = repository
        self._changes = changes
        self._operations = asyncio.Lock()

    async def list_page(self, after: Checkpoint | None, limit: int) -> DeploymentPage:
        found = await self._repository.list_page(after=after, limit=limit + 1)
        items = found[:limit]
        if len(found) <= limit:
            return DeploymentPage(items=items)
        last = items[-1]
        return DeploymentPage(
            items=items,
            checkpoint=Checkpoint(
                updated_at=last.updated_at, deployment_id=last.deployment_id
            ),
        )

    async def get(self, deployment_id: UUID) -> Deployment:
        found = await self._repository.get(deployment_id)
        if found is None:
            raise DeploymentNotFound(deployment_id)
        return found

    async def missing_ids(self, deployment_ids: list[UUID]) -> list[UUID]:
        return await self._repository.missing_ids(deployment_ids)

    async def replace(
        self, deployment_id: UUID, writable: Writable, if_revision: int | None
    ) -> Deployment:
        async with self._operations:
            return await self._replace(deployment_id, writable, if_revision)

    async def _replace(
        self, deployment_id: UUID, writable: Writable, if_revision: int | None
    ) -> Deployment:
        current = await self.get(deployment_id)
        if current.deleted_at is not None:
            raise DeploymentDeleted(deployment_id)
        edited = await self._stamped(
            current,
            {
                "version": writable.version,
                "status": writable.status,
                "type": writable.type,
                "environment": writable.environment,
                "attributes": Attributes.checked(writable.attributes),
            },
        )
        written = await self._repository.replace(edited, if_revision=if_revision)
        if written is None:
            logger.warning("stale write rejected for deployment %s", deployment_id)
            raise StaleWrite(await self.get(deployment_id))
        return await self._published(written, "replaced")

    async def delete(self, deployment_id: UUID) -> Deployment:
        async with self._operations:
            return await self._delete(deployment_id)

    async def _delete(self, deployment_id: UUID) -> Deployment:
        current = await self.get(deployment_id)
        if current.deleted_at is not None:
            raise DeploymentNotFound(deployment_id)
        return await self._written(
            await self._stamped(current, {"deleted_at": datetime.now(UTC)}), "deleted"
        )

    async def restore(self, deployment_id: UUID) -> Deployment:
        async with self._operations:
            return await self._restore(deployment_id)

    async def _restore(self, deployment_id: UUID) -> Deployment:
        current = await self.get(deployment_id)
        if current.deleted_at is None:
            raise DeploymentNotDeleted(deployment_id)
        if current.deleted_at <= datetime.now(UTC) - timedelta(days=30):
            raise DeploymentNotFound(deployment_id)
        return await self._written(
            await self._stamped(current, {"deleted_at": None}), "restored"
        )

    async def _stamped(
        self, current: Deployment, update: dict[str, object]
    ) -> Deployment:
        return current.model_copy(
            update={
                **update,
                "revision": current.revision + 1,
                "updated_at": await self._repository.next_updated_at(),
            }
        )

    async def _written(self, edited: Deployment, operation: str) -> Deployment:
        written = await self._repository.replace(
            edited, if_revision=edited.revision - 1
        )
        if written is None:
            raise StaleWrite(await self.get(edited.deployment_id))
        return await self._published(written, operation)

    async def _published(self, written: Deployment, operation: str) -> Deployment:
        logger.info("%s deployment %s", operation, written.deployment_id)
        await self._changes.publish(written)
        return written
