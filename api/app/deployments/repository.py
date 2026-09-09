from typing import Protocol
from uuid import UUID

from app.deployments.models import Checkpoint, Deployment


class DeploymentRepository(Protocol):
    async def ensure_indexes(self) -> None: ...

    async def list_page(
        self, after: Checkpoint | None, limit: int
    ) -> list[Deployment]: ...

    async def get(self, deployment_id: UUID) -> Deployment | None: ...

    async def replace(
        self, deployment: Deployment, if_revision: int | None
    ) -> Deployment | None: ...
