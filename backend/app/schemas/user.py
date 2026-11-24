import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import UserRole

_USERNAME_RE = re.compile(r"^[a-z0-9._-]+$")


def _validate_username_format(value: object) -> object:
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned and not _USERNAME_RE.match(cleaned):
            raise ValueError(
                "Username may only contain letters, numbers, dots, underscores, or hyphens."
            )
        return cleaned
    return value


def _validate_password_byte_len(value: str | None) -> str | None:
    if value is not None and len(value.encode("utf-8")) > 72:
        raise ValueError("Password cannot exceed 72 UTF-8 bytes.")
    return value


def _normalize_role_input(value: object) -> object:
    if isinstance(value, str):
        cleaned = value.strip().lower()
        if cleaned in {"super_admin", "super admin", "superadmin"}:
            return UserRole.SUPER_ADMIN.value
        if cleaned in {"administrator", "admin"}:
            return UserRole.ADMIN.value
        if cleaned == "scorekeeper":
            return UserRole.SCOREKEEPER.value
    return value


class UserBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int | None = None
    username: str
    email: str | None = None
    full_name: str
    job_title: str | None = None
    phone: str | None = None
    role: UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int | None = None
    username: str
    email: str | None = None
    full_name: str
    job_title: str | None = None
    phone: str | None = None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str | None = Field(default=None, max_length=191)
    full_name: str = Field(min_length=2, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    password: str = Field(min_length=6, max_length=72)
    role: UserRole = UserRole.SCOREKEEPER
    is_active: bool = True

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return _validate_username_format(value)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return _validate_password_byte_len(value)

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value: object) -> object:
        return _normalize_role_input(value)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned


class UserUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=64)
    email: str | None = Field(default=None, max_length=191)
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    password: str | None = Field(default=None, min_length=6, max_length=72)
    role: UserRole | None = None
    is_active: bool | None = None

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str | None) -> str | None:
        return _validate_username_format(value)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str | None) -> str | None:
        return _validate_password_byte_len(value)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value: object) -> object:
        return _normalize_role_input(value)


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)


class UserListResponse(BaseModel):
    items: list[UserRead]
    total: int
    page: int
    page_size: int
    total_pages: int


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class AdminWorkspaceStats(BaseModel):
    scorekeepers_count: int = 0
    active_scorekeepers_count: int = 0
    courts_count: int = 0
    available_courts_count: int = 0
    games_count: int = 0
    live_games_count: int = 0
    upcoming_games_count: int = 0
    completed_games_count: int = 0


class AdminMonitorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str | None = None
    full_name: str
    job_title: str | None = None
    phone: str | None = None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
    club_name: str | None = None
    stats: AdminWorkspaceStats


class AdminSummaryTotals(BaseModel):
    total_admins: int = 0
    active_admins: int = 0
    suspended_admins: int = 0
    total_scorekeepers: int = 0
    total_courts: int = 0
    total_games: int = 0
    total_live_games: int = 0


class AdminMonitorListResponse(BaseModel):
    items: list[AdminMonitorRead]
    total: int
    summary: AdminSummaryTotals


class AdminAccountCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    email: str | None = Field(default=None, max_length=191)
    full_name: str = Field(min_length=2, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    password: str = Field(min_length=6, max_length=72)
    is_active: bool = True

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return _validate_username_format(value)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        return _validate_password_byte_len(value)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned


class AdminAccountUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=64)
    email: str | None = Field(default=None, max_length=191)
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    job_title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=40)
    password: str | None = Field(default=None, min_length=6, max_length=72)
    is_active: bool | None = None

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value: str | None) -> str | None:
        return _validate_username_format(value)

    @field_validator("password")
    @classmethod
    def validate_password_bytes(cls, value: str | None) -> str | None:
        return _validate_password_byte_len(value)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 2:
            raise ValueError("Full name must be at least 2 characters.")
        return cleaned
