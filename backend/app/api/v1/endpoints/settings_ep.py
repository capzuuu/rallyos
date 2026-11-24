from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import (
    require_roles,
    resolve_tenant_admin_id,
)
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.settings_model import PlatformSettings
from app.models.user import User
from app.schemas.pickleball import PlatformSettingsPayload

router = APIRouter()

DEFAULT_SETTINGS = {
    "business": {
        "club_name": "RallyOS Pickleball Club & Arena",
        "logo_text": "RALLYOS",
        "contact_email": "ops@rallyos.club",
        "contact_phone": "(512) 555-0194",
        "location": "420 Courtline Pkwy, Austin, TX 78701",
    },
    "game_defaults": {
        "scoring_type": "Side-Out",
        "points_to_win": 11,
        "win_by_two": True,
        "duration_minutes": 45,
        "match_format": "Single Game",
    },
    "tournament_defaults": {
        "available_formats": [
            "Single Elimination",
            "Double Elimination",
            "Round Robin",
        ],
        "default_registration_days": 14,
        "default_match_format": "Best of 3",
        "default_points_to_win": 11,
        "default_win_by_two": True,
    },
    "court_defaults": {
        "naming_prefix": "Court",
        "default_surface": "Indoor",
        "operating_hours_start": "07:00",
        "operating_hours_end": "22:00",
        "slot_interval_minutes": 60,
    },
}


def _get_or_create_settings(
    db: Session, tenant_id: int | None = None
) -> PlatformSettings:
    stmt = select(PlatformSettings)
    if tenant_id is not None:
        stmt = stmt.where(PlatformSettings.admin_id == tenant_id)
    else:
        stmt = stmt.where(PlatformSettings.admin_id.is_(None))
    rec = db.scalar(stmt.limit(1))
    if not rec:
        rec = PlatformSettings(admin_id=tenant_id, **DEFAULT_SETTINGS)
        db.add(rec)
        db.commit()
        db.refresh(rec)
    return rec


@router.get("", summary="Get platform configuration settings")
def get_settings_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> dict[str, Any]:
    tenant_id = resolve_tenant_admin_id(current_user)
    rec = _get_or_create_settings(db, tenant_id)
    return {
        "business": rec.business,
        "game_defaults": rec.game_defaults,
        "tournament_defaults": rec.tournament_defaults,
        "court_defaults": rec.court_defaults,
    }


@router.patch("", summary="Update platform configuration settings")
def update_settings_endpoint(
    payload: PlatformSettingsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN)
    ),
) -> dict[str, Any]:
    tenant_id = resolve_tenant_admin_id(current_user)
    rec = _get_or_create_settings(db, tenant_id)
    if payload.business is not None:
        rec.business = {**(rec.business or {}), **payload.business}
    if payload.game_defaults is not None:
        rec.game_defaults = {**(rec.game_defaults or {}), **payload.game_defaults}
    if payload.tournament_defaults is not None:
        rec.tournament_defaults = {
            **(rec.tournament_defaults or {}),
            **payload.tournament_defaults,
        }
    if payload.court_defaults is not None:
        rec.court_defaults = {**(rec.court_defaults or {}), **payload.court_defaults}
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return {
        "business": rec.business,
        "game_defaults": rec.game_defaults,
        "tournament_defaults": rec.tournament_defaults,
        "court_defaults": rec.court_defaults,
    }

