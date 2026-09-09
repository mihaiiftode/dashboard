from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from fastapi.responses import JSONResponse

from app.deployments.models import (
    DEFAULT_LIMIT,
    Checkpoint,
    Deployment,
    DeploymentPage,
    ListLimit,
    Writable,
    etag_of,
)
from app.deployments.service import (
    DeploymentDeleted,
    DeploymentNotFound,
    DeploymentService,
    InvalidAttribute,
    StaleWrite,
)
from app.errors import Problem, problem_response

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


def get_precondition(
    if_match: Annotated[
        str | None,
        Header(
            alias="If-Match", description="Version tag the write expects to replace"
        ),
    ] = None,
) -> int | None:
    if if_match is None or if_match.strip() in {"", "*"}:
        return None
    tag = if_match.strip().removeprefix("W/").strip('"')
    if not tag.isdigit():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="If-Match must be a version tag from an earlier response",
        )
    return int(tag)


@router.get(
    "/{deployment_id}",
    summary="Read one deployment",
    description="Returns the deployment and the ETag a later write can use as If-Match.",
    response_model=Deployment,
)
async def get_deployment(
    deployment_id: UUID,
    service: Annotated[DeploymentService, Depends(get_service)],
    response: Response,
) -> Deployment:
    found = await service.get(deployment_id)
    response.headers["ETag"] = etag_of(found.revision)
    return found


@router.put(
    "/{deployment_id}",
    summary="Replace one deployment",
    description=(
        "Writes the whole writable representation. With If-Match the write only lands on the "
        "expected version and answers 412 with the winning deployment otherwise. Deleted "
        "deployments are read only."
    ),
    response_model=Deployment,
)
async def replace_deployment(
    deployment_id: UUID,
    writable: Writable,
    service: Annotated[DeploymentService, Depends(get_service)],
    if_revision: Annotated[int | None, Depends(get_precondition)],
    response: Response,
) -> Deployment:
    written = await service.replace(deployment_id, writable, if_revision=if_revision)
    response.headers["ETag"] = etag_of(written.revision)
    return written


async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DeploymentNotFound)
    return problem_response(
        Problem(
            title="Not Found",
            status=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
            instance=request.url.path,
        )
    )


async def deleted_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DeploymentDeleted)
    return problem_response(
        Problem(
            title="Conflict",
            status=status.HTTP_409_CONFLICT,
            detail=f"{exc} and cannot be edited until it is restored",
            instance=request.url.path,
        )
    )


async def invalid_attribute_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, InvalidAttribute)
    return problem_response(
        Problem(
            title="Unprocessable Content",
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
            instance=request.url.path,
            errors=[{"loc": ["body", "attributes", exc.key], "msg": exc.reason}],
        )
    )


async def stale_write_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StaleWrite)
    return JSONResponse(
        status_code=status.HTTP_412_PRECONDITION_FAILED,
        content=exc.current.model_dump(mode="json"),
        headers={"ETag": etag_of(exc.current.revision)},
    )


def register_deployment_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(DeploymentNotFound, not_found_handler)
    app.add_exception_handler(DeploymentDeleted, deleted_handler)
    app.add_exception_handler(InvalidAttribute, invalid_attribute_handler)
    app.add_exception_handler(StaleWrite, stale_write_handler)
