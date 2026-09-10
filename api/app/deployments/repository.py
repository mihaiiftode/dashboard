from datetime import datetime, timedelta
from typing import Protocol
from uuid import UUID

from app.deployments.models import Checkpoint, Deployment

RETENTION_WINDOW = timedelta(days=30)
RETENTION_SECONDS = int(RETENTION_WINDOW.total_seconds())


class DeploymentRepository(Protocol):
    async def ensure_indexes(self) -> None: ...

    async def next_updated_at(self) -> datetime: ...

    async def missing_ids(self, deployment_ids: list[UUID]) -> list[UUID]: ...

    async def list_page(
        self, after: Checkpoint | None, limit: int
    ) -> list[Deployment]: ...

    async def get(self, deployment_id: UUID) -> Deployment | None: ...

    async def replace(
        self, deployment: Deployment, if_revision: int | None
    ) -> Deployment | None: ...
