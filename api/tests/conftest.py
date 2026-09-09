import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from testcontainers.community.mongodb import MongoDbContainer

from app.main import create_app
from app.settings import Settings


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


def wait_until_reachable(url: str, deadline_seconds: float = 60.0) -> None:
    deadline = time.monotonic() + deadline_seconds
    client: MongoClient = MongoClient(url, serverSelectionTimeoutMS=1000)
    try:
        while True:
            try:
                client.admin.command("ping")
                return
            except PyMongoError:
                if time.monotonic() > deadline:
                    raise
                time.sleep(0.5)
    finally:
        client.close()


@pytest.fixture(scope="session")
def mongo_url() -> Iterator[str]:
    with MongoDbContainer("mongo:7") as mongo:
        url = mongo.get_connection_url()
        wait_until_reachable(url)
        yield url


@pytest.fixture
def settings(mongo_url: str) -> Settings:
    return Settings(mongo_url=mongo_url, database_name="deployments_test")


@asynccontextmanager
async def client_for(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://test") as http:
            yield http


@pytest.fixture
async def client(settings: Settings) -> AsyncIterator[AsyncClient]:
    async with client_for(create_app(settings)) as http:
        yield http
