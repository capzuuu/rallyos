from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import (
    require_roles,
    resolve_tenant_admin_id,
)
from app.core.scheduling import compute_end_time, ranges_overlap
from app.db.session import get_db
from app.models.court import Court
from app.models.enums import CourtStatus, GameStatus, UserRole
from app.models.game import Game
from app.models.user import User
from app.schemas.common import MessageResponse
from app.schemas.pickleball import CourtCreate, CourtRead, CourtUpdate

router = APIRouter()


def _enrich_courts(
    db: Session, courts: list[Court], tenant_id: int | None = None
) -> list[CourtRead]:
    if not courts:
        return []

    court_ids = [court.id for court in courts]
    stmt = select(
        Game.id,
        Game.court_id,
        Game.status,
        Game.code,
        Game.match_type,
        Game.team_a_name,
        Game.team_b_name,
        Game.score_a,
        Game.score_b,
        Game.scheduled_date,
        Game.start_time,
        Game.end_time,
    ).where(
        Game.court_id.in_(court_ids),
        Game.status.in_([GameStatus.LIVE.value, GameStatus.UPCOMING.value]),
    )
    if tenant_id is not None:
        stmt = stmt.where(Game.admin_id == tenant_id)
    active_games = db.execute(stmt).mappings().all()

    by_court: dict[int, list[dict[str, Any]]] = {}
    for g in active_games:
        c_id = g["court_id"]
        if c_id:
            by_court.setdefault(c_id, []).append(dict(g))

    enriched: list[CourtRead] = []
    for court in courts:
        dto = CourtRead.model_validate(court)
        c_games = by_court.get(court.id, [])
        live_game = next(
            (g for g in c_games if g["status"] == GameStatus.LIVE.value), None
        )
        upcoming_games = sorted(
            [g for g in c_games if g["status"] == GameStatus.UPCOMING.value],
            key=lambda x: (x["scheduled_date"], x["start_time"]),
        )
        if live_game:
            dto.current_game = {
                "id": live_game["id"],
                "code": live_game["code"],
                "match_type": live_game["match_type"],
                "team_a_name": live_game["team_a_name"],
                "team_b_name": live_game["team_b_name"],
                "score_a": live_game["score_a"],
                "score_b": live_game["score_b"],
                "start_time": live_game["start_time"],
            }
        if upcoming_games:
            nxt = upcoming_games[0]
            dto.next_scheduled_match = {
                "id": nxt["id"],
                "code": nxt["code"],
                "match_type": nxt["match_type"],
                "team_a_name": nxt["team_a_name"],
                "team_b_name": nxt["team_b_name"],
                "scheduled_date": nxt["scheduled_date"],
                "start_time": nxt["start_time"],
                "end_time": nxt["end_time"],
            }
        enriched.append(dto)
    return enriched


@router.get("", response_model=list[CourtRead], summary="List all pickleball courts")
def list_courts(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> list[CourtRead]:
    tenant_id = resolve_tenant_admin_id(current_user)
    if tenant_id is None:
        return []
    courts = list(
        db.scalars(
            select(Court)
            .where(Court.admin_id == tenant_id)
            .order_by(Court.court_number.asc())
        ).all()
    )
    return _enrich_courts(db, courts, tenant_id)


@router.get(
    "/availability",
    summary="Check court availability for a date/time slot",
)
def check_availability(
    scheduled_date: str = Query(...),
    start_time: str = Query(...),
    duration_minutes: int = Query(default=45, ge=5, le=480),
    exclude_game_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> list[dict[str, Any]]:
    tenant_id = resolve_tenant_admin_id(current_user)
    if tenant_id is None:
        return []
    end_time = compute_end_time(start_time, duration_minutes)
    courts = list(
        db.scalars(
            select(Court)
            .where(Court.admin_id == tenant_id)
            .order_by(Court.court_number.asc())
        ).all()
    )
    games_on_date = db.execute(
        select(
            Game.id,
            Game.court_id,
            Game.code,
            Game.start_time,
            Game.end_time,
        ).where(
            Game.admin_id == tenant_id,
            Game.scheduled_date == scheduled_date,
            Game.status.in_([GameStatus.UPCOMING.value, GameStatus.LIVE.value]),
        )
    ).all()

    results: list[dict[str, Any]] = []
    for court in courts:
        available = True
        reason = "Available"
        if not court.is_enabled or court.status == CourtStatus.DISABLED.value:
            available = False
            reason = "Disabled"
        elif court.status == CourtStatus.MAINTENANCE.value:
            if not court.maintenance_date or court.maintenance_date == scheduled_date:
                m_start = court.maintenance_start or "00:00"
                m_end = court.maintenance_end or "23:59"
                if ranges_overlap(start_time, end_time, m_start, m_end):
                    available = False
                    reason = f"Maintenance ({m_start}–{m_end})"

        if available:
            for g_id, g_court_id, g_code, g_start, g_end in games_on_date:
                if exclude_game_id and g_id == exclude_game_id:
                    continue
                if g_court_id == court.id and ranges_overlap(
                    start_time, end_time, g_start, g_end
                ):
                    available = False
                    reason = f"Booked: {g_code} ({g_start}–{g_end})"
                    break

        results.append(
            {
                "court_id": court.id,
                "court_number": court.court_number,
                "name": court.name,
                "surface_type": court.surface_type,
                "available": available,
                "reason": reason,
            }
        )
    return results


@router.post(
    "",
    response_model=CourtRead,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new pickleball court",
)
def create_court(
    payload: CourtCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> CourtRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    admin_filter = (
        Court.admin_id.is_(None)
        if tenant_id is None
        else Court.admin_id == tenant_id
    )
    existing = db.scalar(
        select(Court).where(
            admin_filter,
            Court.court_number == payload.court_number,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Court #{payload.court_number} already exists.",
        )
    court_data = payload.model_dump()
    court_data["name"] = court_data["name"].strip()
    court = Court(admin_id=tenant_id, **court_data)
    db.add(court)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Could not create Court #{payload.court_number}: {exc.orig}",
        ) from exc
    db.refresh(court)
    return _enrich_courts(db, [court], tenant_id)[0]


@router.patch(
    "/{court_id}",
    response_model=CourtRead,
    summary="Update court settings, status, or maintenance schedule",
)
def update_court(
    court_id: int,
    payload: CourtUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> CourtRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    court = db.get(Court, court_id)
    if not court or (tenant_id is not None and court.admin_id != tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Court not found."
        )
    updates = payload.model_dump(exclude_unset=True)
    if (
        "court_number" in updates
        and updates["court_number"] is not None
        and updates["court_number"] != court.court_number
    ):
        admin_filter = (
            Court.admin_id.is_(None)
            if tenant_id is None
            else Court.admin_id == tenant_id
        )
        dup = db.scalar(
            select(Court).where(
                admin_filter,
                Court.court_number == updates["court_number"],
                Court.id != court.id,
            )
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Court #{updates['court_number']} already exists.",
            )
    if "name" in updates and updates["name"] is not None:
        updates["name"] = updates["name"].strip()
    for k, v in updates.items():
        setattr(court, k, v)
    db.add(court)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Could not update court: {exc.orig}",
        ) from exc
    db.refresh(court)
    return _enrich_courts(db, [court], tenant_id)[0]


@router.delete(
    "/{court_id}",
    response_model=MessageResponse,
    summary="Delete a court",
)
def delete_court(
    court_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> MessageResponse:
    tenant_id = resolve_tenant_admin_id(current_user)
    court = db.get(Court, court_id)
    if not court or (tenant_id is not None and court.admin_id != tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Court not found."
        )
    db.delete(court)
    db.commit()
    return MessageResponse(message="Court deleted.")

