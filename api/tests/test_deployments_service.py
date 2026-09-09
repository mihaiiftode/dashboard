from datetime import UTC, datetime
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest

from app.deployments.change_feed import ChangePublisher
from app.deployments.models import Deployment, Writable
from app.deployments.repository import DeploymentRepository
from app.deployments.service import (
    DeploymentDeleted,
    DeploymentNotFound,
    DeploymentService,
    InvalidAttribute,
    StaleWrite,
)

pytestmark = pytest.mark.anyio

BASE = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


def deployment(
    deployment_id: UUID, deleted: bool = False, revision: int = 3
) -> Deployment:
    return Deployment.model_validate(
        {
            "deployment_id": str(deployment_id),
            "revision": revision,
            "version": "1.0.0",
            "status": "active",
            "type": "worker",
            "environment": "staging",
            "attributes": {"name": "service-a", "team": "platform"},
            "created_at": BASE.isoformat(),
            "created_by": "engineer@example.com",
            "updated_at": BASE.isoformat(),
            "deleted_at": BASE.isoformat() if deleted else None,
        }
    )


def writable(name: str = "renamed", version: str = "2.0.0") -> Writable:
    return Writable.model_validate(
        {
            "version": version,
            "status": "failed",
            "type": "cron_job",
            "environment": "production",
            "attributes": {"name": name, "region": "eu-west-1"},
        }
    )


def publisher() -> AsyncMock:
    return AsyncMock(spec=ChangePublisher)


def service_over(
    repository: AsyncMock, changes: AsyncMock | None = None
) -> DeploymentService:
    return DeploymentService(repository, changes or publisher())


def repository_holding(*rows: Deployment) -> AsyncMock:
    stored = {row.deployment_id: row for row in rows}
    repository = AsyncMock(spec=DeploymentRepository)
    repository.get.side_effect = lambda deployment_id: stored.get(deployment_id)
    repository.replace.side_effect = lambda deployment, if_revision: (
        deployment if written(stored, deployment, if_revision) else None
    )
    return repository


def written(
    stored: dict[UUID, Deployment], deployment: Deployment, if_revision: int | None
) -> bool:
    current = stored.get(deployment.deployment_id)
    if current is None:
        return False
    if if_revision is not None and current.revision != if_revision:
        return False
    stored[deployment.deployment_id] = deployment
    return True


async def test_reads_one_deployment_back() -> None:
    wanted = uuid4()
    service = service_over(repository_holding(deployment(wanted)))

    found = await service.get(wanted)

    assert found.deployment_id == wanted


async def test_raises_not_found_for_an_unknown_deployment() -> None:
    with pytest.raises(DeploymentNotFound):
        await service_over(repository_holding()).get(uuid4())


async def test_writes_every_writable_field_and_stamps_the_write() -> None:
    wanted = uuid4()
    service = service_over(repository_holding(deployment(wanted)))

    stored = await service.replace(wanted, writable(), if_revision=None)

    assert stored.version == "2.0.0"
    assert stored.status == "failed"
    assert stored.type == "cron_job"
    assert stored.environment == "production"
    assert stored.attributes.to_map() == {"name": "renamed", "region": "eu-west-1"}
    assert stored.updated_at > BASE


async def test_bumps_the_revision_on_every_write() -> None:
    wanted = uuid4()
    service = service_over(repository_holding(deployment(wanted, revision=3)))

    first = await service.replace(wanted, writable(), if_revision=None)
    second = await service.replace(wanted, writable(name="again"), if_revision=None)

    assert (first.revision, second.revision) == (4, 5)


async def test_keeps_the_fields_a_client_cannot_write() -> None:
    wanted = uuid4()
    service = service_over(repository_holding(deployment(wanted)))

    stored = await service.replace(wanted, writable(), if_revision=None)

    assert stored.deployment_id == wanted
    assert stored.created_at == BASE
    assert stored.created_by == "engineer@example.com"
    assert stored.deleted_at is None


async def test_asks_the_repository_to_write_only_over_the_expected_revision() -> None:
    wanted = uuid4()
    repository = repository_holding(deployment(wanted, revision=3))

    await service_over(repository).replace(wanted, writable(), if_revision=3)

    assert repository.replace.await_args.kwargs["if_revision"] == 3


async def test_raises_a_stale_write_carrying_the_winning_deployment() -> None:
    wanted = uuid4()
    service = service_over(repository_holding(deployment(wanted, revision=3)))

    with pytest.raises(StaleWrite) as raised:
        await service.replace(wanted, writable(), if_revision=1)

    assert raised.value.current.attributes.name == "service-a"
    assert raised.value.current.revision == 3


async def test_refuses_to_write_a_deleted_deployment() -> None:
    wanted = uuid4()
    repository = repository_holding(deployment(wanted, deleted=True))

    with pytest.raises(DeploymentDeleted):
        await service_over(repository).replace(wanted, writable(), if_revision=None)

    repository.replace.assert_not_awaited()


async def test_raises_not_found_when_writing_an_unknown_deployment() -> None:
    with pytest.raises(DeploymentNotFound):
        await service_over(repository_holding()).replace(
            uuid4(), writable(), if_revision=None
        )


async def test_rejects_a_name_of_only_whitespace() -> None:
    wanted = uuid4()
    repository = repository_holding(deployment(wanted))

    with pytest.raises(InvalidAttribute):
        await service_over(repository).replace(
            wanted, writable(name="   "), if_revision=None
        )

    repository.replace.assert_not_awaited()


async def test_trims_the_attribute_values_it_stores() -> None:
    wanted = uuid4()
    service = service_over(repository_holding(deployment(wanted)))

    stored = await service.replace(
        wanted, writable(name="  padded  "), if_revision=None
    )

    assert stored.attributes.name == "padded"


async def test_publishes_the_written_deployment_to_the_change_feed() -> None:
    wanted = uuid4()
    changes = publisher()
    service = service_over(repository_holding(deployment(wanted)), changes)

    stored = await service.replace(wanted, writable(), if_revision=None)

    changes.publish.assert_awaited_once_with(stored)


async def test_publishes_nothing_when_the_write_loses_to_a_newer_revision() -> None:
    wanted = uuid4()
    changes = publisher()
    service = service_over(repository_holding(deployment(wanted, revision=3)), changes)

    with pytest.raises(StaleWrite):
        await service.replace(wanted, writable(), if_revision=1)

    changes.publish.assert_not_awaited()


async def test_publishes_nothing_when_a_rule_rejects_the_write() -> None:
    wanted = uuid4()
    changes = publisher()
    service = service_over(
        repository_holding(deployment(wanted, deleted=True)), changes
    )

    with pytest.raises(DeploymentDeleted):
        await service.replace(wanted, writable(), if_revision=None)

    changes.publish.assert_not_awaited()
