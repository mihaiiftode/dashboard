import logging
from collections.abc import Awaitable, Callable, Mapping
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
PROBLEM_REF = {"$ref": "#/components/schemas/Problem"}


class Problem(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    errors: list[dict[str, object]] | None = None


PROBLEM_CONTENT = {"application/problem+json": {"schema": PROBLEM_REF}}


def documented_problem(description: str) -> dict[str, object]:
    return {"model": Problem, "content": PROBLEM_CONTENT, "description": description}


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


DOMAIN_PROBLEMS: dict[type[Exception], tuple[str, int, str]] = {
    DeploymentNotFound: ("Not Found", status.HTTP_404_NOT_FOUND, ""),
    DeploymentDeleted: (
        "Conflict",
        status.HTTP_409_CONFLICT,
        " and cannot be edited until it is restored",
    ),
    DeploymentNotDeleted: (
        "Conflict",
        status.HTTP_409_CONFLICT,
        " so there is nothing to restore",
    ),
}


def domain_problem_handler(
    title: str, status_code: int, suffix: str
) -> Callable[[Request, Exception], Awaitable[JSONResponse]]:
    async def handler(request: Request, exc: Exception) -> JSONResponse:
        return problem_response(
            Problem(
                title=title,
                status=status_code,
                detail=f"{exc}{suffix}",
                instance=request.url.path,
            )
        )

    return handler


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


async def stale_write_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StaleWrite)
    return JSONResponse(
        status_code=status.HTTP_412_PRECONDITION_FAILED,
        content=exc.current.model_dump(mode="json"),
        headers={"ETag": etag_of(exc.current.revision)},
    )


def register_deployment_error_handlers(app: FastAPI) -> None:
    for error, (title, status_code, suffix) in DOMAIN_PROBLEMS.items():
        app.add_exception_handler(
            error, domain_problem_handler(title, status_code, suffix)
        )
    app.add_exception_handler(InvalidAttributes, invalid_attributes_handler)
    app.add_exception_handler(StaleWrite, stale_write_handler)
