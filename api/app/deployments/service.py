import logging

from app.deployments.models import Checkpoint, DeploymentPage
from app.deployments.repository import DeploymentRepository

logger = logging.getLogger(__name__)


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
