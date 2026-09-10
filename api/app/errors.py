import logging
from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException

from app.deployments.models import InvalidAttributes, etag_of
from app.deployments.service import (
    DeploymentDeleted,
    DeploymentNotDeleted,
    DeploymentNotFound,
    StaleWrite,
)

logger = logging.getLogger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"


class Problem(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    errors: list[dict[str, object]] | None = None


def problem_response(
    problem: Problem, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(
        status_code=problem.status,
        content=problem.model_dump(exclude_none=True),
        media_type=PROBLEM_MEDIA_TYPE,
        headers=headers,
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, HTTPException)
    title = HTTPStatus(exc.status_code).phrase
    detail = exc.detail if exc.detail and exc.detail != title else None
    return problem_response(
        Problem(
            title=title,
            status=exc.status_code,
            detail=detail,
            instance=request.url.path,
        ),
        headers=exc.headers,
    )


async def validation_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return problem_response(
        Problem(
            title="Unprocessable Content",
            status=422,
            detail="Request validation failed",
            instance=request.url.path,
            errors=jsonable_encoder(exc.errors()),
        )
    )


async def unexpected_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    logger.error("unhandled exception on %s", request.url.path, exc_info=exc)
    return problem_response(
        Problem(title="Internal Server Error", status=500, instance=request.url.path)
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unexpected_exception_handler)


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


async def invalid_attributes_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, InvalidAttributes)
    return problem_response(
        Problem(
            title="Unprocessable Content",
            status=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
            instance=request.url.path,
            errors=[
                {"loc": ["body", "attributes", item.key], "msg": item.reason}
                for item in exc.violations
            ],
        )
    )


async def not_deleted_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DeploymentNotDeleted)
    return problem_response(
        Problem(
            title="Conflict",
            status=status.HTTP_409_CONFLICT,
            detail=f"{exc} so there is nothing to restore",
            instance=request.url.path,
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
    app.add_exception_handler(InvalidAttributes, invalid_attributes_handler)
    app.add_exception_handler(DeploymentNotDeleted, not_deleted_handler)
    app.add_exception_handler(StaleWrite, stale_write_handler)
