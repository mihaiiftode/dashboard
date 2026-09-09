import re
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
    model_serializer,
    model_validator,
)

KEY_RULE = re.compile(r"^[a-z0-9_-]{1,64}$")

AttributeValue = Annotated[str, StringConstraints(min_length=1, max_length=512)]

KNOWN_OPTIONAL_KEYS = (
    "description",
    "team",
    "region",
    "language",
    "framework",
    "priority",
)


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

    @model_validator(mode="after")
    def check_extra_keys(self) -> Self:
        for key, value in self.extras.items():
            if not KEY_RULE.match(key):
                raise ValueError(f"attribute key {key!r} must match {KEY_RULE.pattern}")
            if not isinstance(value, str) or not 1 <= len(value) <= 512:
                raise ValueError(
                    f"attribute {key!r} must be a string of 1 to 512 characters"
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


class Deployment(BaseModel):
    model_config = ConfigDict(extra="ignore")

    deployment_id: UUID
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
    attributes: Attributes


ListLimit = Annotated[int, Field(ge=1, le=1000)]

DEFAULT_LIMIT: Literal[1000] = 1000
