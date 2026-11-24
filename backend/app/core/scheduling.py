from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.court import Court
from app.models.enums import CourtStatus, GameStatus
from app.models.game import Game


def time_to_minutes(t_str: str) -> int:
    try:
        parts = t_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 9 * 60


def minutes_to_time(total_minutes: int) -> str:
    clamped = max(0, min(23 * 60 + 59, total_minutes))
    return f"{clamped // 60:02d}:{clamped % 60:02d}"


def compute_end_time(start_time: str, duration_minutes: int) -> str:
    return minutes_to_time(time_to_minutes(start_time) + duration_minutes)


def ranges_overlap(start_a: str, end_a: str, start_b: str, end_b: str) -> bool:
    a0, a1 = time_to_minutes(start_a), time_to_minutes(end_a)
    b0, b1 = time_to_minutes(start_b), time_to_minutes(end_b)
    if a1 <= a0:
        a1 = a0 + 45
    if b1 <= b0:
        b1 = b0 + 45
    return a0 < b1 and b0 < a1


def check_court_conflict(
    db: Session,
    court_id: int | None,
    scheduled_date: str,
    start_time: str,
    end_time: str,
    exclude_game_id: int | None = None,
    admin_id: int | None = None,
) -> Court | None:
    if court_id is None:
        return None

    court = db.get(Court, court_id)
    if not court or (admin_id is not None and court.admin_id != admin_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Selected court does not exist.",
        )

    if not court.is_enabled or court.status == CourtStatus.DISABLED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{court.name} is currently disabled and cannot be assigned.",
        )

    if court.status == CourtStatus.MAINTENANCE.value:
        if not court.maintenance_date or court.maintenance_date == scheduled_date:
            m_start = court.maintenance_start or "00:00"
            m_end = court.maintenance_end or "23:59"
            if ranges_overlap(start_time, end_time, m_start, m_end):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"{court.name} is scheduled for maintenance ({m_start}–{m_end}).",
                )

    stmt = select(
        Game.id,
        Game.code,
        Game.team_a_name,
        Game.team_b_name,
        Game.start_time,
        Game.end_time,
    ).where(
        Game.court_id == court_id,
        Game.scheduled_date == scheduled_date,
        Game.status.in_([GameStatus.UPCOMING.value, GameStatus.LIVE.value]),
    )
    if admin_id is not None:
        stmt = stmt.where(Game.admin_id == admin_id)
    if exclude_game_id is not None:
        stmt = stmt.where(Game.id != exclude_game_id)

    existing_games = db.execute(stmt).all()
    for _gid, g_code, g_team_a, g_team_b, g_start, g_end in existing_games:
        if ranges_overlap(start_time, end_time, g_start, g_end):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Court conflict: {court.name} is already assigned to {g_code} "
                    f"({g_team_a} vs {g_team_b}) from {g_start} to {g_end}."
                ),
            )
    return court

