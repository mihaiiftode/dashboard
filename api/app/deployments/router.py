from collections.abc import AsyncGenerator
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    Body,
    Depends,
    Header,
    HTTPException,
    Path,
    Query,
    Request,
    Response,
    status,
)
from pydantic import AwareDatetime
from sse_starlette import EventSourceResponse

from app.deployments.change_feed import ChangeFeed
from app.deployments.models import (
    DEFAULT_LIMIT,
    ChangeEvent,
    Checkpoint,
    Deployment,
    DeploymentPage,
    ListLimit,
    Writable,
    etag_of,
)
from app.deployments.service import (
    DeploymentService,
)
from app.errors import documented_problem
from app.settings import Settings

router = APIRouter(prefix="/v1/deployments", tags=["deployments"])

RECONNECT_MS = 1000

DeploymentId = Annotated[UUID, Path(description="Identifier of the deployment")]


def get_service(request: Request) -> DeploymentService:
    return request.app.state.deployment_service


ServiceDep = Annotated[DeploymentService, Depends(get_service)]


def get_change_feed(request: Request) -> ChangeFeed:
    return request.app.state.change_feed


FeedDep = Annotated[ChangeFeed, Depends(get_change_feed)]


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_checkpoint(
    updated_after: Annotated[
        AwareDatetime | None, Query(description="Checkpoint timestamp to resume after")
    ] = None,
    after_id: Annotated[
        UUID | None, Query(description="Checkpoint tiebreaker on equal timestamps")
    ] = None,
) -> Checkpoint | None:
    if updated_after is None and after_id is None:
        return None
    if updated_after is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="after_id requires updated_after",
        )
    if after_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="updated_after requires after_id",
        )
    return Checkpoint(updated_at=updated_after, deployment_id=after_id)


CheckpointDep = Annotated[Checkpoint | None, Depends(get_checkpoint)]


@router.get(
    "",
    summary="List deployments in checkpoint order",
    description=(
        "Returns deployments ordered by updated_at then deployment_id, including deleted ones "
        "so clients can scope them, plus the checkpoint to resume from while more remain."
    ),
    responses={
        422: documented_problem(
            "The limit or the checkpoint parameters are out of range"
        )
    },
)
async def list_deployments(
    service: ServiceDep,
    after: CheckpointDep,
    limit: Annotated[
        ListLimit, Query(description="Maximum deployments to return")
    ] = DEFAULT_LIMIT,
) -> DeploymentPage:
    return await service.list_page(after=after, limit=limit)


@router.get(
    "/events",
    summary="Stream deployment changes",
    description=(
        "Server-sent events, one frame per write, each carrying the changed documents and the "
        "checkpoint to resume from. Comment frames keep the connection warm."
    ),
    response_class=EventSourceResponse,
    responses={
        200: {
            "content": {"text/event-stream": {}},
            "description": "A stream of change events",
        }
    },
)
async def stream_changes(feed: FeedDep, settings: SettingsDep) -> EventSourceResponse:
    return EventSourceResponse(frames(feed), ping=settings.heartbeat_seconds)


async def frames(feed: ChangeFeed) -> AsyncGenerator[dict[str, object]]:
    async with feed.subscribe() as changes:
        yield {"comment": "open", "retry": RECONNECT_MS}
        async for changed in changes:
            if changed is None:
                yield {"event": "resync", "data": "{}"}
            else:
                yield {"data": ChangeEvent.for_one(changed).model_dump_json()}


@router.post(
    "/reconcile",
    summary="Find cached deployments that no longer exist",
    description="Returns missing IDs from a bounded batch, retaining soft-deleted records until the TTL purge.",
    responses={422: documented_problem("Supply at most 1000 deployment IDs")},
)
async def reconcile_deployments(
    deployment_ids: Annotated[list[UUID], Body(max_length=1000)], service: ServiceDep
) -> list[UUID]:
    return await service.missing_ids(deployment_ids)


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


PreconditionDep = Annotated[int | None, Depends(get_precondition)]


@router.get(
    "/{deployment_id}",
    summary="Read one deployment",
    description="Returns the deployment and the ETag a later write can use as If-Match.",
    responses={404: documented_problem("No deployment carries that identifier")},
)
async def get_deployment(
    deployment_id: DeploymentId, service: ServiceDep, response: Response
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
    responses={
        400: documented_problem(
            "If-Match is not a version tag from an earlier response"
        ),
        404: documented_problem("No deployment carries that identifier"),
        409: documented_problem(
            "The deployment is deleted and cannot be edited until it is restored"
        ),
        412: {
            "model": Deployment,
            "description": "The deployment moved on; the body is the version that won",
        },
        422: documented_problem(
            "A field or an attribute breaks a rule; errors carries one entry per key"
        ),
    },
)
async def replace_deployment(
    deployment_id: DeploymentId,
    writable: Writable,
    service: ServiceDep,
    if_revision: PreconditionDep,
    response: Response,
) -> Deployment:
    written = await service.replace(deployment_id, writable, if_revision=if_revision)
    response.headers["ETag"] = etag_of(written.revision)
    return written


@router.delete(
    "/{deployment_id}",
    summary="Delete one deployment",
    description=(
        "Marks the deployment deleted so clients can scope it under the trash. The database "
        "removes it for good after the retention window."
    ),
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        404: documented_problem(
            "No deployment carries that identifier, or it is already deleted"
        )
    },
)
async def delete_deployment(
    deployment_id: DeploymentId, service: ServiceDep
) -> Response:
    deleted = await service.delete(deployment_id)
    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
        headers={"ETag": etag_of(deleted.revision)},
    )


@router.post(
    "/{deployment_id}/restore",
    summary="Restore a deleted deployment",
    description="Returns the deployment to the default scope with every field it had.",
    responses={
        404: documented_problem("No deployment carries that identifier"),
        409: documented_problem(
            "The deployment is not deleted, so there is nothing to restore"
        ),
    },
)
async def restore_deployment(
    deployment_id: DeploymentId, service: ServiceDep, response: Response
) -> Deployment:
    restored = await service.restore(deployment_id)
    response.headers["ETag"] = etag_of(restored.revision)
    return restored
