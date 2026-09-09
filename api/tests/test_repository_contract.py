from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from pymongo import AsyncMongoClient

from app.deployments.memory_repository import InMemoryDeploymentRepository
from app.deployments.models import Checkpoint, Deployment
from app.deployments.mongo_repository import MongoDeploymentRepository
from app.deployments.repository import DeploymentRepository

pytestmark = pytest.mark.anyio

BASE = datetime(2026, 3, 1, 12, 0, tzinfo=UTC)


def deployment(
    offset_seconds: int, deployment_id: UUID, deleted: bool = False
) -> Deployment:
    stamp = BASE + timedelta(seconds=offset_seconds)
    return Deployment.model_validate(
        {
            "deployment_id": str(deployment_id),
            "version": "1.0.0",
            "status": "active",
            "type": "worker",
            "environment": "staging",
            "attributes": {"name": f"service-{offset_seconds}"},
            "created_at": BASE.isoformat(),
            "created_by": "engineer@example.com",
            "updated_at": stamp.isoformat(),
            "deleted_at": stamp.isoformat() if deleted else None,
        }
    )


@pytest.fixture(params=["memory", "mongo"])
async def repository(
    request: pytest.FixtureRequest, mongo_url: str
) -> AsyncIterator[DeploymentRepository]:
    if request.param == "memory":
        yield InMemoryDeploymentRepository()
        return
    client: AsyncMongoClient = AsyncMongoClient(mongo_url)
    database = client[f"contract_{uuid4().hex}"]
    repository = MongoDeploymentRepository(database)
    await repository.ensure_indexes()
    yield repository
    await client.drop_database(database.name)
    await client.close()


async def test_returns_an_empty_page_when_nothing_is_stored(
    repository: DeploymentRepository,
) -> None:
    assert await repository.list_page(after=None, limit=10) == []


async def test_orders_by_updated_at_then_deployment_id(
    repository: DeploymentRepository,
) -> None:
    low, high = sorted([uuid4(), uuid4()])
    latest = uuid4()
    await repository.replace_all(
        [deployment(10, latest), deployment(0, high), deployment(0, low)]
    )

    page = await repository.list_page(after=None, limit=10)

    assert [(row.updated_at, row.deployment_id) for row in page] == [
        (BASE, low),
        (BASE, high),
        (BASE + timedelta(seconds=10), latest),
    ]


async def test_resumes_strictly_after_the_checkpoint(
    repository: DeploymentRepository,
) -> None:
    low, high = sorted([uuid4(), uuid4()])
    latest = uuid4()
    await repository.replace_all(
        [deployment(0, low), deployment(0, high), deployment(10, latest)]
    )

    page = await repository.list_page(
        after=Checkpoint(updated_at=BASE, deployment_id=low), limit=10
    )

    assert [row.deployment_id for row in page] == [high, latest]
    assert [row.updated_at for row in page] == [BASE, BASE + timedelta(seconds=10)]


async def test_honours_the_limit(repository: DeploymentRepository) -> None:
    await repository.replace_all([deployment(index, uuid4()) for index in range(5)])

    page = await repository.list_page(after=None, limit=2)

    assert len(page) == 2


async def test_includes_deleted_deployments(repository: DeploymentRepository) -> None:
    live, gone = uuid4(), uuid4()
    await repository.replace_all(
        [deployment(0, live), deployment(10, gone, deleted=True)]
    )

    page = await repository.list_page(after=None, limit=10)

    assert [row.deployment_id for row in page] == [live, gone]
    assert page[1].deleted_at is not None


async def test_reads_one_deployment_back(repository: DeploymentRepository) -> None:
    wanted = uuid4()
    await repository.replace_all([deployment(0, wanted)])

    found = await repository.get(wanted)

    assert found is not None
    assert found.attributes.name == "service-0"


async def test_returns_none_for_an_unknown_deployment(
    repository: DeploymentRepository,
) -> None:
    assert await repository.get(uuid4()) is None


async def test_ensures_the_checkpoint_and_uniqueness_indexes(mongo_url: str) -> None:
    client: AsyncMongoClient = AsyncMongoClient(mongo_url)
    database = client[f"indexes_{uuid4().hex}"]
    try:
        await MongoDeploymentRepository(database).ensure_indexes()

        indexes = await database["deployments"].index_information()
        unique = [
            name
            for name, spec in indexes.items()
            if spec.get("unique") and spec["key"] == [("deployment_id", 1)]
        ]
        checkpoint = [
            name
            for name, spec in indexes.items()
            if spec["key"] == [("updated_at", 1), ("deployment_id", 1)]
        ]
        expiring = [
            name for name, spec in indexes.items() if "expireAfterSeconds" in spec
        ]

        assert unique
        assert checkpoint
        assert indexes[expiring[0]]["expireAfterSeconds"] == 30 * 24 * 60 * 60
    finally:
        await client.drop_database(database.name)
        await client.close()
