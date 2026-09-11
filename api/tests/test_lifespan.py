import pytest
from pymongo import AsyncMongoClient
from pymongo.errors import OperationFailure

from app import main
from app.main import create_app
from app.settings import Settings
from tests.conftest import client_for

pytestmark = pytest.mark.anyio


class StartupFailure(Exception):
    pass


async def test_closes_the_client_when_startup_fails(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    closed: list[AsyncMongoClient] = []
    original_close = AsyncMongoClient.close

    async def record_close(self: AsyncMongoClient) -> None:
        closed.append(self)
        await original_close(self)

    async def fail(*_: object) -> None:
        raise StartupFailure

    monkeypatch.setattr(AsyncMongoClient, "close", record_close)
    monkeypatch.setattr(main, "ensure_database_work", fail)

    with pytest.raises(StartupFailure):
        async with client_for(create_app(settings)):
            pass

    assert len(closed) == 1


async def test_closes_the_client_on_normal_shutdown(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    closed: list[AsyncMongoClient] = []
    original_close = AsyncMongoClient.close

    async def record_close(self: AsyncMongoClient) -> None:
        closed.append(self)
        await original_close(self)

    monkeypatch.setattr(AsyncMongoClient, "close", record_close)

    async with client_for(create_app(settings)) as client:
        assert (await client.get("/health")).status_code == 200

    assert len(closed) == 1


async def test_startup_remains_reachable_but_unready_when_index_creation_fails(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fail(_: object) -> None:
        raise OperationFailure("cannot create indexes")

    monkeypatch.setattr(main.MongoDeploymentRepository, "ensure_indexes", fail)

    async with client_for(create_app(settings)) as client:
        response = await client.get("/health")

    assert response.status_code == 503
    assert response.json()["detail"] == "Required database indexes unavailable"
