import logging
from datetime import UTC, datetime
from uuid import UUID

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


class StaleWrite(Exception):
    def __init__(self, current: Deployment) -> None:
        super().__init__(f"deployment {current.deployment_id} moved on")
        self.current = current


class InvalidAttribute(Exception):
    def __init__(self, key: str, reason: str) -> None:
        super().__init__(f"attribute {key!r} {reason}")
        self.key = key
        self.reason = reason


class DeploymentService:
    def __init__(self, repository: DeploymentRepository) -> None:
        self._repository = repository

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

    async def replace(
        self, deployment_id: UUID, writable: Writable, if_revision: int | None
    ) -> Deployment:
        current = await self.get(deployment_id)
        if current.deleted_at is not None:
            raise DeploymentDeleted(deployment_id)
        edited = current.model_copy(
            update={
                "version": writable.version,
                "status": writable.status,
                "type": writable.type,
                "environment": writable.environment,
                "attributes": trimmed(writable.attributes),
                "revision": current.revision + 1,
                "updated_at": datetime.now(UTC),
            }
        )
        written = await self._repository.replace(edited, if_revision=if_revision)
        if written is not None:
            logger.info("replaced deployment %s", deployment_id)
            return written
        logger.warning("stale write rejected for deployment %s", deployment_id)
        raise StaleWrite(await self.get(deployment_id))


def trimmed(attributes: Attributes) -> Attributes:
    values = {key: value.strip() for key, value in attributes.to_map().items()}
    for key, value in values.items():
        if value == "":
            raise InvalidAttribute(key, "must not be blank")
    return Attributes.model_validate(values)
