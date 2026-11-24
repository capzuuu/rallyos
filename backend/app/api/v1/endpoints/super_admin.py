from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, delete, func, or_, select
from sqlalchemy.orm import Session

from app.api.v1.endpoints.settings_ep import DEFAULT_SETTINGS
from app.core.deps import require_roles
from app.core.security import hash_password
from app.db.session import get_db
from app.models.court import Court
from app.models.enums import CourtStatus, GameStatus, UserRole
from app.models.game import Game
from app.models.settings_model import PlatformSettings
from app.models.tournament import Tournament
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.user import (
    AdminAccountCreate,
    AdminAccountUpdate,
    AdminMonitorListResponse,
    AdminMonitorRead,
    AdminSummaryTotals,
    AdminWorkspaceStats,
)

router = APIRouter()


def _build_admin_monitor_items(
    db: Session, admin_users: list[User]
) -> list[AdminMonitorRead]:
    if not admin_users:
        return []

    admin_ids = [u.id for u in admin_users]

    stats_map: dict[int, AdminWorkspaceStats] = {
        aid: AdminWorkspaceStats() for aid in admin_ids
    }

    scorekeeper_rows = db.execute(
        select(
            User.admin_id,
            func.count(User.id),
            func.sum(case((User.is_active.is_(True), 1), else_=0)),
        )
        .where(
            User.role == UserRole.SCOREKEEPER.value,
            User.admin_id.in_(admin_ids),
        )
        .group_by(User.admin_id)
    ).all()
    for aid, total_cnt, active_cnt in scorekeeper_rows:
        if aid in stats_map:
            stats_map[aid].scorekeepers_count = int(total_cnt or 0)
            stats_map[aid].active_scorekeepers_count = int(active_cnt or 0)

    court_rows = db.execute(
        select(
            Court.admin_id,
            func.count(Court.id),
            func.sum(
                case(
                    (
                        and_(
                            Court.is_enabled.is_(True),
                            Court.status == CourtStatus.AVAILABLE.value,
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
        )
        .where(Court.admin_id.in_(admin_ids))
        .group_by(Court.admin_id)
    ).all()
    for aid, total_cnt, avail_cnt in court_rows:
        if aid in stats_map:
            stats_map[aid].courts_count = int(total_cnt or 0)
            stats_map[aid].available_courts_count = int(avail_cnt or 0)

    game_rows = db.execute(
        select(
            Game.admin_id,
            func.count(Game.id),
            func.sum(case((Game.status == GameStatus.LIVE.value, 1), else_=0)),
            func.sum(case((Game.status == GameStatus.UPCOMING.value, 1), else_=0)),
            func.sum(case((Game.status == GameStatus.COMPLETED.value, 1), else_=0)),
        )
        .where(Game.admin_id.in_(admin_ids))
        .group_by(Game.admin_id)
    ).all()
    for aid, total_cnt, live_cnt, upcoming_cnt, completed_cnt in game_rows:
        if aid in stats_map:
            stats_map[aid].games_count = int(total_cnt or 0)
            stats_map[aid].live_games_count = int(live_cnt or 0)
            stats_map[aid].upcoming_games_count = int(upcoming_cnt or 0)
            stats_map[aid].completed_games_count = int(completed_cnt or 0)

    settings_rows = db.execute(
        select(PlatformSettings.admin_id, PlatformSettings.business).where(
            PlatformSettings.admin_id.in_(admin_ids)
        )
    ).all()

    club_by_admin: dict[int, str] = {}
    for aid, business in settings_rows:
        if aid is not None and isinstance(business, dict):
            club_name = business.get("club_name")
            if isinstance(club_name, str) and club_name.strip():
                club_by_admin[aid] = club_name.strip()

    items: list[AdminMonitorRead] = []
    for admin in admin_users:
        items.append(
            AdminMonitorRead(
                id=admin.id,
                username=admin.username,
                email=admin.email,
                full_name=admin.full_name,
                job_title=admin.job_title,
                phone=admin.phone,
                role=UserRole(admin.role),
                is_active=admin.is_active,
                created_at=admin.created_at,
                updated_at=admin.updated_at,
                club_name=club_by_admin.get(admin.id),
                stats=stats_map[admin.id],
            )
        )
    return items


@router.get(
    "/admins",
    response_model=AdminMonitorListResponse,
    summary="Monitor all Administrator accounts and workspace activity (Super Admin only)",
)
def list_admin_accounts(
    search: str | None = Query(default=None, max_length=120),
    is_active: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    _super_admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
) -> AdminMonitorListResponse:
    all_admins = list(
        db.scalars(
            select(User)
            .where(User.role == UserRole.ADMIN.value)
            .order_by(User.created_at.desc(), User.id.desc())
        ).all()
    )
    all_items = _build_admin_monitor_items(db, all_admins)

    summary = AdminSummaryTotals(
        total_admins=len(all_items),
        active_admins=sum(1 for a in all_items if a.is_active),
        suspended_admins=sum(1 for a in all_items if not a.is_active),
        total_scorekeepers=sum(a.stats.scorekeepers_count for a in all_items),
        total_courts=sum(a.stats.courts_count for a in all_items),
        total_games=sum(a.stats.games_count for a in all_items),
        total_live_games=sum(a.stats.live_games_count for a in all_items),
    )

    filtered = all_items
    if is_active is not None:
        filtered = [a for a in filtered if a.is_active is is_active]
    if search and search.strip():
        q = search.strip().lower()
        filtered = [
            a
            for a in filtered
            if q in a.username.lower()
            or q in a.full_name.lower()
            or (a.job_title and q in a.job_title.lower())
            or (a.club_name and q in a.club_name.lower())
        ]

    return AdminMonitorListResponse(
        items=filtered,
        total=len(filtered),
        summary=summary,
    )


@router.post(
    "/admins",
    response_model=AdminMonitorRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new Administrator account (Super Admin only)",
)
def create_admin_account(
    payload: AdminAccountCreate,
    db: Session = Depends(get_db),
    _super_admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
) -> AdminMonitorRead:
    existing = db.scalar(select(User).where(User.username == payload.username))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this username already exists.",
        )

    admin_user = User(
        admin_id=None,
        username=payload.username,
        email=payload.email or f"{payload.username}@rallyos.club",
        full_name=payload.full_name,
        job_title=payload.job_title.strip() if payload.job_title else "Club Administrator",
        phone=payload.phone.strip() if payload.phone else None,
        hashed_password=hash_password(payload.password),
        role=UserRole.ADMIN.value,
        is_active=payload.is_active,
    )
    db.add(admin_user)
    db.flush()

    db.add(PlatformSettings(admin_id=admin_user.id, **DEFAULT_SETTINGS))
    db.commit()
    db.refresh(admin_user)

    return _build_admin_monitor_items(db, [admin_user])[0]


@router.patch(
    "/admins/{admin_id}",
    response_model=AdminMonitorRead,
    summary="Update, suspend/activate, or reset password for an Administrator account (Super Admin only)",
)
def update_admin_account(
    admin_id: int,
    payload: AdminAccountUpdate,
    db: Session = Depends(get_db),
    _super_admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
) -> AdminMonitorRead:
    admin_user = db.get(User, admin_id)
    if not admin_user or admin_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Administrator account not found.",
        )

    updates = payload.model_dump(exclude_unset=True)
    if "username" in updates and updates["username"] is not None:
        dup = db.scalar(
            select(User).where(
                User.username == updates["username"], User.id != admin_user.id
            )
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this username already exists.",
            )
        admin_user.username = updates["username"]

    if "email" in updates:
        admin_user.email = updates["email"] or admin_user.email
    if "full_name" in updates and updates["full_name"] is not None:
        admin_user.full_name = updates["full_name"].strip()
    if "job_title" in updates:
        admin_user.job_title = (
            updates["job_title"].strip() if updates["job_title"] else None
        )
    if "phone" in updates:
        admin_user.phone = (
            updates["phone"].strip() if updates["phone"] else None
        )
    if "password" in updates and updates["password"]:
        admin_user.hashed_password = hash_password(updates["password"])
    if "is_active" in updates and updates["is_active"] is not None:
        admin_user.is_active = updates["is_active"]

    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)

    return _build_admin_monitor_items(db, [admin_user])[0]


@router.delete(
    "/admins/{admin_id}",
    response_model=MessageResponse,
    summary="Delete an Administrator account and its isolated workspace (Super Admin only)",
)
def delete_admin_account(
    admin_id: int,
    db: Session = Depends(get_db),
    _super_admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
) -> MessageResponse:
    admin_user = db.get(User, admin_id)
    if not admin_user or admin_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Administrator account not found.",
        )

    db.execute(delete(Game).where(Game.admin_id == admin_user.id))
    db.execute(delete(Tournament).where(Tournament.admin_id == admin_user.id))
    db.execute(delete(Court).where(Court.admin_id == admin_user.id))
    db.execute(
        delete(PlatformSettings).where(PlatformSettings.admin_id == admin_user.id)
    )
    db.execute(
        delete(User).where(
            or_(User.admin_id == admin_user.id, User.id == admin_user.id)
        )
    )
    db.commit()
    return MessageResponse(message="Administrator account deleted successfully.")

