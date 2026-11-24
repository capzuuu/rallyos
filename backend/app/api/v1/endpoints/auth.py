import re
import secrets
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.v1.endpoints.settings_ep import DEFAULT_SETTINGS
from app.core.config import settings
from app.core.deps import get_current_active_user
from app.core.rate_limit import enforce_auth_rate_limit
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.settings_model import PlatformSettings
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
)
from app.schemas.common import MessageResponse
from app.schemas.user import ProfileUpdateRequest, TokenResponse, UserRead

router = APIRouter()


def _issue_token_response(user: User) -> TokenResponse:
    access_token = create_access_token(subject=user.id, role=user.role)
    refresh_token = create_refresh_token(subject=user.id, role=user.role)
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserRead.model_validate(user),
    )


def _authenticate_user(db: Session, username: str, password: str) -> User:
    normalized = username.strip().lower()
    user = db.scalar(
        select(User).where(
            or_(User.username == normalized, User.email == normalized)
        )
    )
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Contact an administrator.",
        )
    return user


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new workspace member account",
)
def register(
    request: Request,
    payload: RegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    if not settings.ALLOW_PUBLIC_REGISTER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is disabled. Contact an administrator.",
        )
    enforce_auth_rate_limit(request, "register", payload.username)
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this username already exists.",
        )

    user = User(
        admin_id=None,
        username=payload.username,
        email=payload.email or f"{payload.username}@rallyos.club",
        full_name=payload.full_name,
        job_title=payload.job_title.strip() if payload.job_title else "Club Administrator",
        hashed_password=hash_password(payload.password),
        role=UserRole.ADMIN.value,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Initialize facility settings for this new administrator
    db.add(PlatformSettings(admin_id=user.id, **DEFAULT_SETTINGS))
    db.commit()

    return _issue_token_response(user)


@router.post(
    "/google",
    response_model=TokenResponse,
    summary="Authenticate or register user via Google OAuth (Supabase Auth)",
)
def google_auth(
    request: Request,
    payload: GoogleLoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    enforce_auth_rate_limit(request, "google_login", payload.email)
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid email address is required for Google sign-in.",
        )

    # 1. Look for existing user by email or username
    user = db.scalar(
        select(User).where(or_(User.email == email, User.username == email))
    )

    if user:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been deactivated. Contact an administrator.",
            )
        if payload.full_name and (not user.full_name or user.full_name == user.username):
            user.full_name = payload.full_name.strip()
            db.add(user)
            db.commit()
            db.refresh(user)
        return _issue_token_response(user)

    # 2. If user does not exist, provision a new Scorekeeper account
    if not settings.ALLOW_PUBLIC_REGISTER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is disabled. Contact an administrator.",
        )

    raw_prefix = email.split("@")[0].lower()
    cleaned_prefix = re.sub(r"[^a-z0-9._-]", "", raw_prefix)
    if len(cleaned_prefix) < 2:
        cleaned_prefix = f"user_{secrets.token_hex(3)}"

    candidate_username = cleaned_prefix[:50]
    counter = 1
    while db.scalar(select(User).where(User.username == candidate_username)):
        candidate_username = f"{cleaned_prefix[:40]}_{counter}"
        counter += 1

    full_name = (payload.full_name or candidate_username).strip()
    if len(full_name) < 2:
        full_name = candidate_username

    random_pw = secrets.token_urlsafe(32)
    user = User(
        admin_id=None,
        username=candidate_username,
        email=email,
        full_name=full_name,
        job_title="Club Administrator",
        hashed_password=hash_password(random_pw),
        role=UserRole.ADMIN.value,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Initialize facility settings for this new administrator
    db.add(PlatformSettings(admin_id=user.id, **DEFAULT_SETTINGS))
    db.commit()

    return _issue_token_response(user)



@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate with username and password (JSON)",
)
def login(
    request: Request,
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    enforce_auth_rate_limit(request, "login", payload.username)
    user = _authenticate_user(db, payload.username, payload.password)
    return _issue_token_response(user)


@router.post(
    "/token",
    response_model=TokenResponse,
    summary="OAuth2 password flow token endpoint (for Swagger UI)",
)
def login_oauth2(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    enforce_auth_rate_limit(request, "token", form_data.username)
    user = _authenticate_user(db, form_data.username, form_data.password)
    return _issue_token_response(user)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange a valid refresh token for new access and refresh tokens",
)
def refresh_tokens(
    request: Request,
    payload: RefreshTokenRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    enforce_auth_rate_limit(request, "refresh")
    invalid_token_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token.",
    )
    try:
        decoded = decode_token(payload.refresh_token)
        if decoded.get("type") != "refresh":
            raise invalid_token_exc
        user_id = int(decoded["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise invalid_token_exc

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise invalid_token_exc

    return _issue_token_response(user)


@router.get("/me", response_model=UserRead, summary="Get current authenticated user")
def get_me(current_user: User = Depends(get_current_active_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead, summary="Update current user profile")
def update_me(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> UserRead:
    if payload.full_name is not None:
        current_user.full_name = payload.full_name.strip()
    if payload.job_title is not None:
        current_user.job_title = payload.job_title.strip() or None
    if payload.phone is not None:
        current_user.phone = payload.phone.strip() or None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UserRead.model_validate(current_user)


@router.post(
    "/change-password",
    response_model=MessageResponse,
    summary="Change current user's password",
)
def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    enforce_auth_rate_limit(request, "change_password", str(current_user.id))
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )
    current_user.hashed_password = hash_password(payload.new_password)
    db.add(current_user)
    db.commit()
    return MessageResponse(message="Password updated successfully.")
