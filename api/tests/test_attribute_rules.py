import pytest

from app.deployments.models import Attributes, InvalidAttributes

VALID = {"name": "payment-api", "team": "payments"}


def violations_for(values: dict[str, str]) -> list[tuple[str, str]]:
    with pytest.raises(InvalidAttributes) as raised:
        Attributes.checked(values)
    return [(violation.key, violation.reason) for violation in raised.value.violations]


def test_accepts_the_keys_and_values_the_dashboard_writes() -> None:
    checked = Attributes.checked({**VALID, "cost_centre": "cc-42"})

    assert checked.to_map() == {**VALID, "cost_centre": "cc-42"}


def test_trims_surrounding_whitespace_from_every_value() -> None:
    checked = Attributes.checked({"name": "  payment-api  ", "team": " payments "})

    assert checked.to_map() == VALID


def test_refuses_a_name_that_is_only_whitespace() -> None:
    assert violations_for({**VALID, "name": "   "}) == [("name", "must not be blank")]


def test_refuses_to_drop_the_name() -> None:
    assert violations_for({"team": "payments"}) == [("name", "is required")]


@pytest.mark.parametrize(
    "key", ["Not Allowed", "spaces here", "üñî", "a" * 65, "", "UPPER"]
)
def test_refuses_a_key_outside_the_rule(key: str) -> None:
    assert violations_for({**VALID, key: "value"}) == [
        (key, "must be 1 to 64 characters of a-z, 0-9, underscore or hyphen")
    ]


def test_refuses_a_value_longer_than_the_limit() -> None:
    assert violations_for({**VALID, "team": "x" * 513}) == [
        ("team", "must be at most 512 characters")
    ]


def test_refuses_a_malformed_oncall_address() -> None:
    assert violations_for({**VALID, "oncall": "not-an-email"}) == [
        ("oncall", "must be an email address")
    ]


def test_reports_every_violation_at_once() -> None:
    assert violations_for({"name": "", "Bad Key": "value", "oncall": "nope"}) == [
        ("name", "must not be blank"),
        ("oncall", "must be an email address"),
        ("Bad Key", "must be 1 to 64 characters of a-z, 0-9, underscore or hyphen"),
    ]


def test_keeps_an_attribute_of_exactly_the_maximum_length() -> None:
    checked = Attributes.checked({**VALID, "team": "x" * 512})

    assert checked.to_map()["team"] == "x" * 512
