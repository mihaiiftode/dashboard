import logging
from collections.abc import AsyncIterator

import pytest
from fastapi import APIRouter
from httpx import AsyncClient
from pydantic import BaseModel, field_validator

from app.main import create_app
from app.settings import Settings
from tests.conftest import client_for

pytestmark = pytest.mark.anyio

PROBLEM = "application/problem+json"


@pytest.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    app = create_app(settings)
    probes = APIRouter()

    @probes.get("/probe/echo")
    async def echo(n: int) -> dict[str, int]:
        return {"n": n}

    @probes.get("/probe/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    class Label(BaseModel):
        name: str

        @field_validator("name")
        @classmethod
        def non_empty(cls, value: str) -> str:
            if not value:
                raise ValueError("name must not be empty")
            return value

    @probes.post("/probe/label")
    async def label(body: Label) -> Label:
        return body

    app.include_router(probes)
    async with client_for(app) as http:
        yield http


async def test_unknown_route_is_problem_json_404(client: AsyncClient) -> None:
    response = await client.get("/nope")

    assert response.status_code == 404
    assert response.headers["content-type"] == PROBLEM
    assert response.json() == {
        "type": "about:blank",
        "title": "Not Found",
        "status": 404,
        "instance": "/nope",
    }


async def test_validation_failure_is_problem_json_422_with_errors(
    client: AsyncClient,
) -> None:
    response = await client.get("/probe/echo", params={"n": "abc"})

    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM
    body = response.json()
    assert body["title"] == "Unprocessable Content"
    assert body["errors"][0]["loc"] == ["query", "n"]


async def test_validator_error_is_problem_json_422_not_500(client: AsyncClient) -> None:
    response = await client.post("/probe/label", json={"name": ""})

    assert response.status_code == 422
    assert response.headers["content-type"] == PROBLEM
    assert response.json()["errors"][0]["msg"] == "Value error, name must not be empty"


async def test_unexpected_exception_is_problem_json_500_and_logged(
    client: AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.ERROR):
        response = await client.get("/probe/boom")

    assert response.status_code == 500
    assert response.headers["content-type"] == PROBLEM
    assert response.json() == {
        "type": "about:blank",
        "title": "Internal Server Error",
        "status": 500,
        "instance": "/probe/boom",
    }
    record = next(r for r in caplog.records if r.levelno == logging.ERROR)
    assert record.exc_info is not None
    assert "boom" in caplog.text
