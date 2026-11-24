import re

from pydantic import BaseModel, Field, field_validator

_USERNAME_RE = re.compile(r"^[a-z0-9._-]+$")


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str | None = Field(default=None, max_length=191)
    full_name: str = Field(min_length=2, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    password: str = Field(min_length=6, max_length=72)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        cleaned = value.strip().lower()
        if cleaned and not _USERNAME_RE.match(cleaned):
            raise ValueError(
                "Username may only contain letters, numbers, dots, underscores, or hyphens."
            )
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password cannot exceed 72 UTF-8 bytes.")
        return value

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=191)
    password: str = Field(min_length=1, max_length=72)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip().lower() if isinstance(value, str) else value


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=10)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=6, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_new_password_bytes(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password cannot exceed 72 UTF-8 bytes.")
        return value


class GoogleLoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=191)
    full_name: str | None = Field(default=None, max_length=120)
    supabase_uid: str | None = Field(default=None, max_length=128)
    id_token: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower() if isinstance(value, str) else value

