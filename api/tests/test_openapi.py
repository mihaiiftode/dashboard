from app.main import create_app
from app.settings import Settings

PROBLEM_REF = {"$ref": "#/components/schemas/Problem"}
DEPLOYMENT_REF = {"$ref": "#/components/schemas/Deployment"}


def test_error_responses_reference_one_shared_problem_schema() -> None:
    spec = create_app(Settings()).openapi()

    assert "Problem" in spec["components"]["schemas"]
    responses = spec["paths"]["/v1/deployments/{deployment_id}"]["put"]["responses"]
    assert (
        responses["404"]["content"]["application/problem+json"]["schema"] == PROBLEM_REF
    )
    assert responses["412"]["content"]["application/json"]["schema"] == DEPLOYMENT_REF
