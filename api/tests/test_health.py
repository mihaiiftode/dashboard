import pytest
from httpx import AsyncClient

from app.main import create_app
from app.settings import Settings
from tests.conftest import client_for

pytestmark = pytest.mark.anyio


async def test_health_reports_ok_when_database_reachable(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_health_reports_unavailable_when_database_unreachable(
    settings: Settings,
) -> None:
    unreachable = settings.model_copy(
        update={"mongo_url": "mongodb://127.0.0.1:1", "mongo_timeout_ms": 200}
    )
    async with client_for(create_app(unreachable)) as client:
        response = await client.get("/health")

    assert response.status_code == 503
    assert response.headers["content-type"] == "application/problem+json"
    assert response.json()["detail"] == "Database unreachable"
