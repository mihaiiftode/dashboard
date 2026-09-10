import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from pymongo.asynchronous.database import AsyncDatabase

from app.deployments.change_feed import ChangeFeed
from app.deployments.models import Checkpoint
from app.deployments.mongo_repository import MongoDeploymentRepository
from app.deployments.service import DeploymentService
from tests.conftest import store
from tests.test_deployments_service import deployment, writable

pytestmark = pytest.mark.anyio


async def test_concurrent_unconditional_writes_each_advance_the_revision(
    database: AsyncDatabase,
) -> None:
    row = deployment(UUID(int=1))
    await store(database, [row])
    service = DeploymentService(MongoDeploymentRepository(database), ChangeFeed())

    writes = await asyncio.gather(
        *(service.replace(row.deployment_id, writable(str(i)), None) for i in range(12))
    )

    assert sorted(item.revision for item in writes) == list(range(4, 16))
    assert (await service.get(row.deployment_id)).revision == 15


async def test_restart_and_clock_rollback_cannot_put_a_write_behind_a_checkpoint(
    database: AsyncDatabase,
) -> None:
    future = datetime.now(UTC) + timedelta(days=2)
    first = deployment(UUID(int=2)).model_copy(update={"updated_at": future})
    second = deployment(UUID(int=1))
    await store(database, [first, second])
    repository = MongoDeploymentRepository(database)
    service = DeploymentService(repository, ChangeFeed())
    checkpoint = Checkpoint(updated_at=future, deployment_id=first.deployment_id)

    written = await service.replace(second.deployment_id, writable(), None)
    resumed = await service.list_page(checkpoint, 100)

    assert [item.deployment_id for item in resumed.items] == [second.deployment_id]
    assert written.updated_at > future
    restarted = DeploymentService(MongoDeploymentRepository(database), ChangeFeed())
    next_write = await restarted.replace(first.deployment_id, writable(), None)
    assert next_write.updated_at > written.updated_at


async def test_expired_deployment_cannot_be_restored_before_the_ttl_sweep(
    database: AsyncDatabase,
) -> None:
    from app.deployments.service import DeploymentNotFound

    row = deployment(UUID(int=1), deleted=True).model_copy(
        update={"deleted_at": datetime.now(UTC) - timedelta(days=31)}
    )
    await store(database, [row])
    service = DeploymentService(MongoDeploymentRepository(database), ChangeFeed())

    with pytest.raises(DeploymentNotFound):
        await service.restore(row.deployment_id)
