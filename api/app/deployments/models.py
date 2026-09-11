import re
from collections.abc import Mapping
from enum import StrEnum
from typing import Annotated, Any, Literal, Self
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    TypeAdapter,
    ValidationError,
    model_serializer,
    model_validator,
)

KEY_RULE = re.compile(r"^[a-z0-9_-]{1,64}$")
VALUE_MAX_LENGTH = 512

AttributeValue = Annotated[
    str, StringConstraints(min_length=1, max_length=VALUE_MAX_LENGTH)
]

KEY_REASON = "must be 1 to 64 characters of a-z, 0-9, underscore or hyphen"
RESERVED_KEYS = frozenset(
    {
        "id",
        "deployment_id",
        "status",
        "type",
        "env",
        "environment",
        "version",
        "creator",
        "created_by",
        "created",
        "created_at",
        "deleted",
        "deleted_at",
        "is",
    }
)
RESERVED_REASON = "is reserved by a built-in field and cannot name an attribute"
BLANK_REASON = "must not be blank"
LENGTH_REASON = f"must be at most {VALUE_MAX_LENGTH} characters"
EMAIL_REASON = "must be an email address"
REQUIRED_REASON = "is required"


class AttributeViolation(BaseModel):
    key: str
    reason: str


class InvalidAttributes(Exception):
    def __init__(self, violations: list[AttributeViolation]) -> None:
        super().__init__(", ".join(f"{item.key} {item.reason}" for item in violations))
        self.violations = violations


class Status(StrEnum):
    active = "active"
    failed = "failed"
    stopped = "stopped"


class DeploymentType(StrEnum):
    web_service = "web_service"
    worker = "worker"
    cron_job = "cron_job"


class Environment(StrEnum):
    production = "production"
    staging = "staging"
    development = "development"


class Attributes(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: AttributeValue
    description: AttributeValue | None = None
    team: AttributeValue | None = None
    region: AttributeValue | None = None
    language: AttributeValue | None = None
    framework: AttributeValue | None = None
    priority: AttributeValue | None = None
    oncall: EmailStr | None = None

    @classmethod
    def checked(cls, values: Mapping[str, str]) -> Self:
        """Trims every value and reports every rule an edit breaks, not only the first."""
        trimmed = {key: value.strip() for key, value in values.items()}
        violations = [*known_violations(trimmed), *extra_violations(trimmed)]
        if violations:
            raise InvalidAttributes(violations)
        return cls.model_validate(trimmed)

    @model_validator(mode="after")
    def check_extra_keys(self) -> Self:
        for key, value in self.extras.items():
            if not KEY_RULE.match(key):
                raise ValueError(f"attribute key {key!r} must match {KEY_RULE.pattern}")
            if not isinstance(value, str) or not 1 <= len(value) <= VALUE_MAX_LENGTH:
                raise ValueError(
                    f"attribute {key!r} must be a string of 1 to {VALUE_MAX_LENGTH} characters"
                )
        return self

    @property
    def extras(self) -> dict[str, Any]:
        return self.__pydantic_extra__ or {}

    @model_serializer
    def to_map(self) -> dict[str, str]:
        known = {
            name: value
            for name, value in (
                (key, getattr(self, key)) for key in type(self).model_fields
            )
            if value is not None
        }
        return {**known, **self.extras}


Revision = Annotated[
    int, Field(ge=1, description="Bumped on every write, the concurrency token")
]


def known_violations(values: Mapping[str, str]) -> list[AttributeViolation]:
    found: list[AttributeViolation] = []
    for key in Attributes.model_fields:
        value = values.get(key)
        if value is None:
            if key == "name":
                found.append(AttributeViolation(key=key, reason=REQUIRED_REASON))
            continue
        reason = value_reason(key, value)
        if reason is not None:
            found.append(AttributeViolation(key=key, reason=reason))
    return found


def extra_violations(values: Mapping[str, str]) -> list[AttributeViolation]:
    found: list[AttributeViolation] = []
    for key, value in values.items():
        if key in Attributes.model_fields:
            continue
        if key in RESERVED_KEYS:
            found.append(AttributeViolation(key=key, reason=RESERVED_REASON))
            continue
        reason = KEY_REASON if not KEY_RULE.match(key) else value_reason(key, value)
        if reason is not None:
            found.append(AttributeViolation(key=key, reason=reason))
    return found


def value_reason(key: str, value: str) -> str | None:
    if value == "":
        return BLANK_REASON
    if len(value) > VALUE_MAX_LENGTH:
        return LENGTH_REASON
    if key == "oncall" and not is_email(value):
        return EMAIL_REASON
    return None


def is_email(value: str) -> bool:
    try:
        _EMAIL.validate_python(value)
    except ValidationError:
        return False
    return True


_EMAIL = TypeAdapter(EmailStr)


class Deployment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    deployment_id: UUID
    revision: Revision = 1
    version: AttributeValue
    status: Status
    type: DeploymentType
    environment: Environment
    attributes: Attributes
    created_at: AwareDatetime
    created_by: EmailStr
    updated_at: AwareDatetime
    deleted_at: AwareDatetime | None = None

    def to_document(self) -> dict[str, Any]:
        return {
            "deployment_id": str(self.deployment_id),
            "revision": self.revision,
            "version": self.version,
            "status": self.status.value,
            "type": self.type.value,
            "environment": self.environment.value,
            "attributes": self.attributes.to_map(),
            "created_at": self.created_at,
            "created_by": self.created_by,
            "updated_at": self.updated_at,
            "deleted_at": self.deleted_at,
        }


class Checkpoint(BaseModel):
    updated_at: AwareDatetime
    deployment_id: UUID


class DeploymentPage(BaseModel):
    items: list[Deployment]
    checkpoint: Checkpoint | None = None


class Writable(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: AttributeValue
    status: Status
    type: DeploymentType
    environment: Environment
    attributes: dict[str, str]


def etag_of(revision: int) -> str:
    return f'"{revision}"'


ListLimit = Annotated[int, Field(ge=1, le=1000)]

DEFAULT_LIMIT: Literal[1000] = 1000
