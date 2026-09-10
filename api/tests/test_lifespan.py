import pytest
from pymongo import AsyncMongoClient

from app import main
from app.main import create_app
from app.settings import Settings
from tests.conftest import client_for

pytestmark = pytest.mark.anyio


class StartupFailure(Exception):
    pass


async def test_closes_the_client_when_startup_fails(
    scratch_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    closed: list[AsyncMongoClient] = []
    original_close = AsyncMongoClient.close

    async def record_close(self: AsyncMongoClient) -> None:
        closed.append(self)
        await original_close(self)

    async def fail(_: object) -> None:
        raise StartupFailure

    monkeypatch.setattr(AsyncMongoClient, "close", record_close)
    monkeypatch.setattr(main, "ensure_indexes", fail)

    with pytest.raises(StartupFailure):
        async with client_for(create_app(scratch_settings)):
            pass

    assert len(closed) == 1


async def test_closes_the_client_on_normal_shutdown(
    scratch_settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    closed: list[AsyncMongoClient] = []
    original_close = AsyncMongoClient.close

    async def record_close(self: AsyncMongoClient) -> None:
        closed.append(self)
        await original_close(self)

    monkeypatch.setattr(AsyncMongoClient, "close", record_close)

    async with client_for(create_app(scratch_settings)) as client:
        assert (await client.get("/health")).status_code == 200

    assert len(closed) == 1
