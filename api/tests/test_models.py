from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.deployments.models import Deployment

SEED_ATTRIBUTES: dict[str, str] = {
    "name": "payment-api",
    "description": "Handles card authorisation for checkout.",
    "team": "payments",
    "region": "eu-west-1",
    "language": "python",
    "framework": "fastapi",
    "priority": "critical",
    "oncall": "oncall@example.com",
}

SEED_RECORD: dict[str, object] = {
    "deployment_id": "3f1a5c7e-9b2d-4e6f-8a1b-2c3d4e5f6a7b",
    "version": "2.14.3",
    "status": "active",
    "type": "web_service",
    "environment": "production",
    "attributes": SEED_ATTRIBUTES,
    "created_at": "2026-02-11T09:15:00+00:00",
    "created_by": "engineer@example.com",
    "updated_at": "2026-03-04T17:42:00+00:00",
    "deleted_at": None,
}


def record(**overrides: object) -> dict[str, object]:
    return {**SEED_RECORD, **overrides}


def attributes(**overrides: str) -> dict[str, object]:
    return {"attributes": {**SEED_ATTRIBUTES, **overrides}}


def test_accepts_a_seed_record() -> None:
    deployment = Deployment.model_validate(SEED_RECORD)

    assert str(deployment.deployment_id) == SEED_RECORD["deployment_id"]
    assert deployment.attributes.name == "payment-api"
    assert deployment.created_at.tzinfo is not None
    assert deployment.deleted_at is None


def test_keeps_unknown_attribute_keys_as_strings() -> None:
    deployment = Deployment.model_validate(record(**attributes(cost_centre="cc-42")))

    assert deployment.attributes.extras["cost_centre"] == "cc-42"


def test_rejects_a_missing_name() -> None:
    payload = record(attributes={"team": "payments"})

    with pytest.raises(ValidationError, match="name"):
        Deployment.model_validate(payload)


@pytest.mark.parametrize(
    "field,value",
    [
        ("status", "paused"),
        ("type", "lambda"),
        ("environment", "qa"),
        ("created_by", "not-an-email"),
    ],
)
def test_rejects_values_outside_the_closed_vocabulary(field: str, value: str) -> None:
    with pytest.raises(ValidationError, match=field):
        Deployment.model_validate(record(**{field: value}))


@pytest.mark.parametrize("key", ["Region", "region!", "", "r" * 65])
def test_rejects_attribute_keys_outside_the_key_rule(key: str) -> None:
    with pytest.raises(ValidationError, match="key"):
        Deployment.model_validate(
            record(attributes={"name": "payment-api", key: "value"})
        )


@pytest.mark.parametrize("value", ["", "v" * 513])
def test_rejects_attribute_values_outside_the_length_rule(value: str) -> None:
    with pytest.raises(ValidationError):
        Deployment.model_validate(record(**attributes(team=value)))


def test_rejects_a_non_email_oncall() -> None:
    with pytest.raises(ValidationError, match="oncall"):
        Deployment.model_validate(record(**attributes(oncall="pager")))


def test_serialises_attributes_back_to_a_flat_map() -> None:
    deployment = Deployment.model_validate(record(**attributes(cost_centre="cc-42")))

    stored = deployment.to_document()

    assert stored["attributes"]["name"] == "payment-api"
    assert stored["attributes"]["cost_centre"] == "cc-42"
    assert isinstance(stored["created_at"], datetime)
    assert stored["created_at"] == datetime(2026, 2, 11, 9, 15, tzinfo=UTC)
    assert "_id" not in stored
