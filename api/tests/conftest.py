import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pymongo import AsyncMongoClient, MongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError
from testcontainers.community.mongodb import MongoDbContainer

from app.deployments.models import Deployment
from app.deployments.mongo_repository import COLLECTION_NAME
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


@pytest.fixture
def scratch_settings(mongo_url: str) -> Settings:
    return Settings(mongo_url=mongo_url, database_name=f"test_{uuid4().hex}")


@pytest.fixture
async def database(scratch_settings: Settings) -> AsyncIterator[AsyncDatabase]:
    client: AsyncMongoClient = AsyncMongoClient(scratch_settings.mongo_url)
    scratch = client[scratch_settings.database_name]
    yield scratch
    await client.drop_database(scratch.name)
    await client.close()


async def store(database: AsyncDatabase, rows: list[Deployment]) -> None:
    if rows:
        await database[COLLECTION_NAME].insert_many([row.to_document() for row in rows])
