import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError

from app.deployments.change_feed import ChangeFeed
from app.deployments.mongo_repository import MongoDeploymentRepository
from app.deployments.repository import DeploymentRepository
from app.deployments.router import router as deployments_router
from app.deployments.seeding import seed_if_empty
from app.deployments.service import DeploymentService
from app.errors import register_deployment_error_handlers, register_error_handlers
from app.health import HealthCheck
from app.health import router as health_router
from app.log_config import configure_logging
from app.settings import Settings

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    configure_logging(settings.log_format, settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client: AsyncMongoClient = AsyncMongoClient(
            settings.mongo_url, serverSelectionTimeoutMS=settings.mongo_timeout_ms
        )
        try:
            deployments = MongoDeploymentRepository.from_client(
                client, settings.database_name
            )
            await ensure_indexes(deployments)
            if settings.seed_on_startup:
                await seed_deployments(
                    client[settings.database_name], settings.seed_count
                )
            changes = ChangeFeed()
            app.state.settings = settings
            app.state.change_feed = changes
            app.state.health_check = HealthCheck(client, settings.database_name)
            app.state.deployment_service = DeploymentService(deployments, changes)
            yield
        finally:
            await client.close()

    app = FastAPI(title="Deployments API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    register_deployment_error_handlers(app)
    app.include_router(health_router)
    app.include_router(deployments_router)
    return app


async def ensure_indexes(repository: DeploymentRepository) -> None:
    try:
        await repository.ensure_indexes()
    except PyMongoError as error:
        logger.error("index creation failed, continuing without it: %s", error)


async def seed_deployments(database: AsyncDatabase, count: int) -> None:
    try:
        await seed_if_empty(database, count)
    except PyMongoError as error:
        logger.error("seeding failed, continuing without it: %s", error)
