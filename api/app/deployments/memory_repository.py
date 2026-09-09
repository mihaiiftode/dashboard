from uuid import UUID

from app.deployments.models import Checkpoint, Deployment


class InMemoryDeploymentRepository:
    def __init__(self, deployments: list[Deployment] | None = None) -> None:
        self._rows: dict[UUID, Deployment] = {
            row.deployment_id: row for row in deployments or []
        }

    async def ensure_indexes(self) -> None:
        return None

    async def list_page(self, after: Checkpoint | None, limit: int) -> list[Deployment]:
        ordered = sorted(
            self._rows.values(),
            key=lambda row: (row.updated_at, str(row.deployment_id)),
        )
        if after is not None:
            cursor = (after.updated_at, str(after.deployment_id))
            ordered = [
                row
                for row in ordered
                if (row.updated_at, str(row.deployment_id)) > cursor
            ]
        return ordered[:limit]

    async def get(self, deployment_id: UUID) -> Deployment | None:
        return self._rows.get(deployment_id)

    async def replace_all(self, deployments: list[Deployment]) -> None:
        self._rows = {row.deployment_id: row for row in deployments}
