from typing import Annotated, Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

MongoUrl = Annotated[
    str,
    Field(validation_alias=AliasChoices("API_MONGO_URL", "MONGODB_URI")),
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="API_", env_file=("../.env", ".env"), extra="ignore"
    )

    mongo_url: MongoUrl = "mongodb://localhost:27017"
    database_name: str = "deployments"
    cors_origins: list[str] = ["http://localhost:3000"]
    cors_origin_regex: str | None = None
    seed_on_startup: bool = False
    seed_count: int = 5000
    log_format: Literal["json", "plain"] = "plain"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    mongo_timeout_ms: int = 2000
    heartbeat_seconds: float = 15.0
