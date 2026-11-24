import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import (
    require_roles,
    resolve_tenant_admin_id,
)
from app.core.security import hash_password
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.user import (
    UserBrief,
    UserCreate,
    UserListResponse,
    UserRead,
    UserUpdate,
)

router = APIRouter()


@router.get(
    "/directory",
    response_model=list[UserBrief],
    summary="List active workspace users for owner/assignee selectors",
)
def list_user_directory(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)),
) -> list[UserBrief]:
    tenant_id = resolve_tenant_admin_id(current_user)
    users = db.scalars(
        select(User)
        .where(
            User.is_active.is_(True),
            or_(User.id == tenant_id, User.admin_id == tenant_id),
        )
        .order_by(User.full_name.asc(), User.id.asc())
    ).all()
    return [UserBrief.model_validate(u) for u in users]


@router.get(
    "",
    response_model=UserListResponse,
    summary="List all users for current Administrator (Admin only)",
)
def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None, max_length=120),
    role: UserRole | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserListResponse:
    filters = [
        or_(User.id == current_admin.id, User.admin_id == current_admin.id)
    ]
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                User.username.ilike(term),
                User.full_name.ilike(term),
                User.job_title.ilike(term),
            )
        )
    if role is not None:
        filters.append(User.role == role.value)
    if is_active is not None:
        filters.append(User.is_active.is_(is_active))

    count_stmt = select(func.count(User.id)).where(*filters)
    list_stmt = select(User).where(*filters)

    total = db.scalar(count_stmt) or 0
    total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
    offset = (page - 1) * page_size

    items = db.scalars(
        list_stmt.order_by(User.created_at.desc(), User.id.desc())
        .offset(offset)
        .limit(page_size)
    ).all()

    return UserListResponse(
        items=[UserRead.model_validate(user) for user in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a Scorekeeper account for the current Administrator (Admin only)",
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserRead:
    if payload.role != UserRole.SCOREKEEPER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Super Admin can create Administrator accounts.",
        )

    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this username already exists.",
        )

    user = User(
        admin_id=current_admin.id,
        username=payload.username,
        email=payload.email or f"{payload.username}@rallyos.club",
        full_name=payload.full_name,
        job_title=payload.job_title.strip() if payload.job_title else None,
        phone=payload.phone.strip() if payload.phone else None,
        hashed_password=hash_password(payload.password),
        role=UserRole.SCOREKEEPER.value,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


@router.get(
    "/{user_id}",
    response_model=UserRead,
    summary="Get user by ID (Admin only)",
)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserRead:
    user = db.get(User, user_id)
    if not user or (
        user.id != current_admin.id and user.admin_id != current_admin.id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return UserRead.model_validate(user)


@router.patch(
    "/{user_id}",
    response_model=UserRead,
    summary="Update user profile, role, or active status (Admin only)",
)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_roles(UserRole.ADMIN)),
) -> UserRead:
    user = db.get(User, user_id)
    if not user or (
        user.id != current_admin.id and user.admin_id != current_admin.id
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if user.id == current_admin.id:
        if "is_active" in updates and updates["is_active"] is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot deactivate your own admin account.",
            )
        if "role" in updates and updates["role"] != UserRole.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot demote your own admin role.",
            )

    if "username" in updates and updates["username"] is not None:
        dup = db.scalar(
            select(User.id).where(
                User.username == updates["username"], User.id != user.id
            )
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this username already exists.",
            )
        user.username = updates["username"]
    if "full_name" in updates and updates["full_name"] is not None:
        user.full_name = updates["full_name"]
    if "job_title" in updates:
        user.job_title = (
            updates["job_title"].strip() if updates["job_title"] else None
        )
    if "phone" in updates:
        user.phone = (
            updates["phone"].strip() if updates["phone"] else None
        )
    if "password" in updates and updates["password"]:
        user.hashed_password = hash_password(updates["password"])
    if "role" in updates and updates["role"] is not None:
        if updates["role"] != UserRole.SCOREKEEPER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only a Super Admin can assign Administrator roles.",
            )
        user.role = UserRole.SCOREKEEPER.value
        user.admin_id = current_admin.id
    if "is_active" in updates and updates["is_active"] is not None:
        user.is_active = updates["is_active"]

    db.add(user)
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


@router.delete(
    "/{user_id}",
    response_model=MessageResponse,
    summary="Delete a user (Admin only)",
)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_roles(UserRole.ADMIN)),
) -> MessageResponse:
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )
    user = db.get(User, user_id)
    if not user or user.admin_id != current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    db.delete(user)
    db.commit()
    return MessageResponse(message="User deleted successfully.")
