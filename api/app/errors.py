import logging
from collections.abc import Mapping
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException

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
