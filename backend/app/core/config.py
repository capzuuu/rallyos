from functools import lru_cache
from typing import Annotated
from urllib.parse import quote_plus

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "RallyOS API"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    SECRET_KEY: str = Field(
        default="dev-only-rallyos-secret-key-please-replace-before-deploying-2026",
        min_length=16,
    )
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "root"
    MYSQL_PASSWORD: str = ""
    MYSQL_DATABASE: str = "rallyos"
    DATABASE_URL: str | None = None
    SUPABASE_URL: str | None = "https://qaocdecturwknyrbisse.supabase.co"
    SUPABASE_ANON_KEY: str | None = None
    SUPABASE_SERVICE_ROLE_KEY: str | None = None
    SUPABASE_JWT_SECRET: str | None = None
    DB_POOL_SIZE: int = Field(default=10, ge=1, le=100)
    DB_MAX_OVERFLOW: int = Field(default=20, ge=0, le=200)
    DB_POOL_TIMEOUT: int = Field(default=30, ge=5, le=120)
    DB_SSL_CA: str | None = None

    RATE_LIMIT_ENABLED: bool = True
    AUTH_RATE_LIMIT_MAX_ATTEMPTS: int = Field(default=20, ge=1, le=1000)
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = Field(default=60, ge=1, le=3600)
    ALLOW_PUBLIC_REGISTER: bool = True

    WS_MAX_CONNECTIONS_PER_GAME: int = Field(default=100, ge=1, le=2000)
    WS_MAX_TOTAL_CONNECTIONS: int = Field(default=2000, ge=10, le=20000)

    CORS_ORIGINS: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    CORS_ORIGIN_REGEX: str | None = (
        r"^https?://(localhost|127\.0\.0\.1|\[::1\]|(?:\d{1,3}\.){3}\d{1,3}|.*\.vercel\.app)(:\d+)?$"
    )

    @field_validator("CORS_ORIGIN_REGEX", mode="before")
    @classmethod
    def normalize_cors_regex(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = str(value).strip()
        return cleaned or None

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                import json

                parsed = json.loads(stripped)
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value

    @property
    def sqlalchemy_database_uri(self) -> str:
        if self.DATABASE_URL:
            url = self.DATABASE_URL.strip()
            # Normalize postgres:// or postgresql:// to postgresql+psycopg2://
            if url.startswith("postgres://"):
                url = "postgresql+psycopg2://" + url[len("postgres://"):]
            elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
                url = "postgresql+psycopg2://" + url[len("postgresql://"):]
            return url
        user = quote_plus(self.MYSQL_USER)
        password = quote_plus(self.MYSQL_PASSWORD)
        auth = f"{user}:{password}" if self.MYSQL_PASSWORD else user
        return (
            f"mysql+pymysql://{auth}@{self.MYSQL_HOST}:{self.MYSQL_PORT}"
            f"/{self.MYSQL_DATABASE}?charset=utf8mb4"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()


_INSECURE_DEFAULT_SECRETS = {
    "dev-only-rallyos-secret-key-please-replace-before-deploying-2026",
    "change-this-in-production-use-a-long-random-secret-key-min-32-chars",
}


def validate_production_security(cfg: Settings | None = None) -> None:
    target = cfg or settings
    if target.APP_ENV.strip().lower() == "production":
        if target.SECRET_KEY in _INSECURE_DEFAULT_SECRETS or len(target.SECRET_KEY) < 32:
            raise RuntimeError(
                "Insecure SECRET_KEY configured for production. "
                "Set a unique random SECRET_KEY (>= 32 chars) in environment variables."
            )

