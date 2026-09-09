import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from app.deployments.mongo_repository import MongoDeploymentRepository
from app.deployments.repository import DeploymentRepository
from app.deployments.router import register_deployment_error_handlers
from app.deployments.router import router as deployments_router
from app.deployments.service import DeploymentService
from app.errors import register_error_handlers
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
        deployments = MongoDeploymentRepository.from_client(
            client, settings.database_name
        )
        await ensure_indexes(deployments)
        app.state.health_check = HealthCheck(client)
        app.state.deployment_service = DeploymentService(deployments)
        yield
        await client.close()

    app = FastAPI(title="Deployments API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
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
