from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pymongo import AsyncMongoClient

from app.errors import register_error_handlers
from app.health import HealthCheck
from app.health import router as health_router
from app.log_config import configure_logging
from app.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    configure_logging(settings.log_format, settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client: AsyncMongoClient = AsyncMongoClient(
            settings.mongo_url, serverSelectionTimeoutMS=settings.mongo_timeout_ms
        )
        app.state.health_check = HealthCheck(client)
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
    app.include_router(health_router)
    return app
