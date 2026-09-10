import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from app.errors import documented_problem
from app.index_readiness import required_indexes_present

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


class HealthCheck:
    def __init__(self, client: AsyncMongoClient, database_name: str) -> None:
        self._client = client
        self._database = client[database_name]

    async def database_reachable(self) -> bool:
        try:
            await self._client.admin.command("ping")
        except PyMongoError as exc:
            logger.warning("database ping failed: %s", exc)
            return False
        return True

    async def required_indexes_present(self) -> bool:
        try:
            return await required_indexes_present(self._database)
        except PyMongoError as exc:
            logger.warning("database index check failed: %s", exc)
            return False


def get_health_check(request: Request) -> HealthCheck:
    return request.app.state.health_check


@router.get(
    "/health",
    summary="Report whether the API database is ready",
    description="Answers 200 when the database is reachable and has its required indexes.",
    responses={503: documented_problem("The database is unreachable or unready")},
)
async def health(
    check: Annotated[HealthCheck, Depends(get_health_check)],
) -> dict[str, str]:
    if not await check.database_reachable():
        raise HTTPException(status_code=503, detail="Database unreachable")
    if not await check.required_indexes_present():
        raise HTTPException(
            status_code=503, detail="Required database indexes unavailable"
        )
    return {"status": "ok"}
