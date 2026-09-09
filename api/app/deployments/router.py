from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.deployments.models import DEFAULT_LIMIT, Checkpoint, DeploymentPage, ListLimit
from app.deployments.service import DeploymentService

router = APIRouter(prefix="/v1/deployments", tags=["deployments"])


def get_service(request: Request) -> DeploymentService:
    return request.app.state.deployment_service


def get_checkpoint(
    updated_after: Annotated[
        datetime | None, Query(description="Checkpoint timestamp to resume after")
    ] = None,
    after_id: Annotated[
        UUID | None, Query(description="Checkpoint tiebreaker on equal timestamps")
    ] = None,
) -> Checkpoint | None:
    if after_id is None:
        return None
    if updated_after is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="after_id requires updated_after",
        )
    return Checkpoint(updated_at=updated_after, deployment_id=after_id)


@router.get(
    "",
    summary="List deployments in checkpoint order",
    description=(
        "Returns deployments ordered by updated_at then deployment_id, including deleted ones "
        "so clients can scope them, plus the checkpoint to resume from while more remain."
    ),
    response_model=DeploymentPage,
)
async def list_deployments(
    service: Annotated[DeploymentService, Depends(get_service)],
    after: Annotated[Checkpoint | None, Depends(get_checkpoint)],
    limit: Annotated[
        ListLimit, Query(description="Maximum deployments to return")
    ] = DEFAULT_LIMIT,
) -> DeploymentPage:
    return await service.list_page(after=after, limit=limit)
