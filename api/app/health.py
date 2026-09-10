import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pymongo import AsyncMongoClient
from pymongo.errors import PyMongoError

from app.errors import documented_problem

logger = logging.getLogger(__name__)
router = APIRouter()


class HealthCheck:
    def __init__(self, client: AsyncMongoClient) -> None:
        self._client = client

    async def database_reachable(self) -> bool:
        try:
            await self._client.admin.command("ping")
        except PyMongoError as exc:
            logger.warning("database ping failed: %s", exc)
            return False
        return True


def get_health_check(request: Request) -> HealthCheck:
    return request.app.state.health_check


@router.get(
    "/health",
    tags=["health"],
    summary="Report whether the API can reach its database",
    description="Answers 200 when a database ping succeeds and 503 when it does not.",
    responses={503: documented_problem("The database did not answer a ping")},
)
async def health(
    check: Annotated[HealthCheck, Depends(get_health_check)],
) -> dict[str, str]:
    if not await check.database_reachable():
        raise HTTPException(status_code=503, detail="Database unreachable")
    return {"status": "ok"}
