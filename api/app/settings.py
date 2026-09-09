from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="API_", env_file=("../.env", ".env"), extra="ignore"
    )

    mongo_url: str = "mongodb://localhost:27017"
    database_name: str = "deployments"
    cors_origins: list[str] = ["http://localhost:3000"]
    log_format: Literal["json", "plain"] = "plain"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    mongo_timeout_ms: int = 2000
