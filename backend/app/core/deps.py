from collections.abc import Callable

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_PREFIX}/auth/token",
    auto_error=False,
)


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate authentication credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        sub = payload.get("sub")
        if sub is None:
            raise credentials_exception
        user_id = int(sub)
    except (jwt.PyJWTError, ValueError):
        raise credentials_exception

    user = db.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account. Please contact an administrator.",
        )
    return current_user


def require_roles(*allowed_roles: UserRole) -> Callable[[User], User]:
    allowed_values = {role.value for role in allowed_roles}

    def role_checker(
        current_user: User = Depends(get_current_active_user),
    ) -> User:
        if current_user.role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return role_checker


def resolve_tenant_admin_id(user: User | None) -> int | None:
    if user is None:
        return None
    if user.role == UserRole.SUPER_ADMIN.value:
        return None
    if user.role == UserRole.ADMIN.value:
        return user.id
    return user.admin_id if user.admin_id is not None else user.id


def get_optional_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    if not token:
        return None
    try:
        current_user = get_current_user(token=token, db=db)
        if not current_user.is_active:
            return None
        return current_user
    except HTTPException:
        return None


def require_roles_if_authenticated(
    *allowed_roles: UserRole,
) -> Callable[[str | None, Session], User | None]:
    allowed_values = {role.value for role in allowed_roles}

    def optional_role_checker(
        token: str | None = Depends(oauth2_scheme),
        db: Session = Depends(get_db),
    ) -> User | None:
        if not token:
            return None
        current_user = get_current_user(token=token, db=db)
        if not current_user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Inactive user account. Please contact an administrator.",
            )
        if current_user.role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account role does not have permission for this operation.",
            )
        return current_user

    return optional_role_checker


