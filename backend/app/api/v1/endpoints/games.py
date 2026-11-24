import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.deps import (
    require_roles,
    require_roles_if_authenticated,
    resolve_tenant_admin_id,
)
from app.core.realtime import scoreboard_manager
from app.core.scheduling import check_court_conflict, compute_end_time
from app.db.session import get_db
from app.models.court import Court
from app.models.enums import CourtStatus, GameStatus, MatchFormat, UserRole
from app.models.game import Game
from app.models.tournament import Tournament
from app.models.user import User
from app.services.game_scoring import (
    apply_add_point,
    apply_change_server,
    apply_complete_game,
    apply_undo_event,
)
from app.schemas.pickleball import (
    CompleteGameRequest,
    GameCreate,
    GameRead,
    GameUpdate,
    ScorePointRequest,
    ServerChangeRequest,
)

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _find_game(
    db: Session, game_key: str, tenant_id: int | None = None
) -> Game:
    if game_key.isdigit():
        game = db.get(Game, int(game_key))
        if game and (tenant_id is None or game.admin_id == tenant_id):
            return game
    stmt = select(Game).where(Game.code == game_key.upper())
    if tenant_id is not None:
        stmt = stmt.where(Game.admin_id == tenant_id)
    game = db.scalar(stmt.order_by(Game.id.desc()).limit(1))
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Game not found."
        )
    return game


def _required_sets_to_win(match_format: str) -> int:
    if match_format == MatchFormat.BEST_OF_3.value:
        return 2
    if match_format == MatchFormat.BEST_OF_5.value:
        return 3
    return 1


def _is_set_won(score_a: int, score_b: int, target: int, win_by_two: bool) -> str | None:
    margin = 2 if win_by_two else 1
    if score_a >= target and (score_a - score_b) >= margin:
        return "A"
    if score_b >= target and (score_b - score_a) >= margin:
        return "B"
    return None


def _sync_tournament_match_result(db: Session, game: Game) -> None:
    if not game.tournament_id or not game.tournament_match_id:
        return
    tournament = db.get(Tournament, game.tournament_id)
    if not tournament or not tournament.matches:
        return

    matches = [dict(m) for m in tournament.matches]
    target_match = next(
        (m for m in matches if str(m.get("id")) == str(game.tournament_match_id)),
        None,
    )
    if not target_match:
        return

    target_match["score_a"] = game.score_a
    target_match["score_b"] = game.score_b
    target_match["status"] = game.status

    if game.status == GameStatus.COMPLETED.value and game.winner_team:
        winner_name = (
            game.team_a_name if game.winner_team == "A" else game.team_b_name
        )
        loser_name = (
            game.team_b_name if game.winner_team == "A" else game.team_a_name
        )
        target_match["winner"] = winner_name

        next_win_id = target_match.get("next_win_match_id")
        next_win_slot = target_match.get("next_win_slot", "A")
        if next_win_id:
            nxt = next(
                (m for m in matches if str(m.get("id")) == str(next_win_id)),
                None,
            )
            if nxt:
                if next_win_slot == "A":
                    nxt["team_a"] = winner_name
                else:
                    nxt["team_b"] = winner_name

        next_loss_id = target_match.get("next_loss_match_id")
        next_loss_slot = target_match.get("next_loss_slot", "A")
        if next_loss_id:
            nxt_l = next(
                (m for m in matches if str(m.get("id")) == str(next_loss_id)),
                None,
            )
            if nxt_l:
                if next_loss_slot == "A":
                    nxt_l["team_a"] = loser_name
                else:
                    nxt_l["team_b"] = loser_name

    tournament.matches = matches
    db.add(tournament)


@router.get("", response_model=list[GameRead], summary="List pickleball games")
def list_games(
    search: str | None = Query(default=None),
    scheduled_date: str | None = Query(default=None),
    court_id: int | None = Query(default=None),
    match_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> list[GameRead]:
    tenant_id = resolve_tenant_admin_id(current_user)
    if tenant_id is None:
        return []
    stmt = select(Game).where(Game.admin_id == tenant_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Game.code.ilike(term),
                Game.team_a_name.ilike(term),
                Game.team_b_name.ilike(term),
            )
        )
    if scheduled_date:
        stmt = stmt.where(Game.scheduled_date == scheduled_date)
    if court_id is not None:
        stmt = stmt.where(Game.court_id == court_id)
    if match_type:
        stmt = stmt.where(Game.match_type == match_type)
    if status_filter:
        stmt = stmt.where(Game.status == status_filter)

    stmt = stmt.order_by(
        Game.scheduled_date.asc(), Game.start_time.asc(), Game.id.desc()
    )
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)

    games = db.scalars(stmt).all()
    return [GameRead.model_validate(g) for g in games]


@router.post(
    "",
    response_model=GameRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new pickleball match with court conflict validation",
)
def create_game(
    payload: GameCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    end_time = payload.end_time or compute_end_time(
        payload.start_time, payload.duration_minutes
    )
    court = check_court_conflict(
        db=db,
        court_id=payload.court_id,
        scheduled_date=payload.scheduled_date,
        start_time=payload.start_time,
        end_time=end_time,
        admin_id=tenant_id,
    )

    admin_filter = (
        Game.admin_id.is_(None) if tenant_id is None else Game.admin_id == tenant_id
    )
    if payload.code:
        code = payload.code.strip().upper()
        if db.scalar(select(Game.id).where(admin_filter, Game.code == code).limit(1)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Game code {code} already exists.",
            )
    else:
        total_games = db.scalar(select(func.count(Game.id)).where(admin_filter)) or 0
        seq = 1001 + int(total_games)
        while db.scalar(
            select(Game.id).where(admin_filter, Game.code == f"GM-{seq}").limit(1)
        ):
            seq += 1
        code = f"GM-{seq}"

    team_a_players = [p.strip() for p in (payload.team_a_players or []) if p.strip()]
    team_b_players = [p.strip() for p in (payload.team_b_players or []) if p.strip()]
    team_a_name = (
        payload.team_a_name.strip()
        if payload.team_a_name and payload.team_a_name.strip()
        else " / ".join(team_a_players)
    )
    team_b_name = (
        payload.team_b_name.strip()
        if payload.team_b_name and payload.team_b_name.strip()
        else " / ".join(team_b_players)
    )

    game = Game(
        admin_id=tenant_id,
        code=code,
        match_type=payload.match_type,
        team_a_name=team_a_name,
        team_a_players=team_a_players,
        team_b_name=team_b_name,
        team_b_players=team_b_players,
        court_id=court.id if court else None,
        court_name=court.name if court else "Unassigned",
        scheduled_date=payload.scheduled_date,
        start_time=payload.start_time,
        end_time=end_time,
        duration_minutes=payload.duration_minutes,
        match_format=payload.match_format,
        scoring_type=payload.scoring_type,
        points_to_win=payload.points_to_win,
        win_by_two=payload.win_by_two,
        serving_team="A",
        server_number=2 if payload.match_type == "Doubles" else 1,
        status=GameStatus.UPCOMING.value,
        tournament_id=payload.tournament_id,
        tournament_name=payload.tournament_name,
        tournament_match_id=payload.tournament_match_id,
        set_scores=[],
        score_events=[],
    )
    db.add(game)
    db.commit()
    db.refresh(game)
    return GameRead.model_validate(game)


@router.get(
    "/{game_key}",
    response_model=GameRead,
    summary="Get game by ID or Game Code (e.g. GM-1001)",
)
def get_game(
    game_key: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(
        require_roles_if_authenticated(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    game = _find_game(db, game_key, tenant_id)
    return GameRead.model_validate(game)


@router.patch(
    "/{game_key}",
    response_model=GameRead,
    summary="Update or reschedule a game",
)
async def update_game(
    game_key: str,
    payload: GameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    game = _find_game(db, game_key, tenant_id)
    updates = payload.model_dump(exclude_unset=True)

    new_court_id = updates.get("court_id", game.court_id)
    new_date = updates.get("scheduled_date", game.scheduled_date)
    new_start = updates.get("start_time", game.start_time)
    new_duration = updates.get("duration_minutes", game.duration_minutes)
    new_end = updates.get("end_time") or compute_end_time(new_start, new_duration)

    if any(k in updates for k in ("court_id", "scheduled_date", "start_time", "end_time", "duration_minutes")):
        court = check_court_conflict(
            db=db,
            court_id=new_court_id,
            scheduled_date=new_date,
            start_time=new_start,
            end_time=new_end,
            exclude_game_id=game.id,
            admin_id=tenant_id,
        )
        game.court_id = court.id if court else None
        game.court_name = court.name if court else "Unassigned"
        game.end_time = new_end

    for k, v in updates.items():
        if k not in {"court_id", "end_time"} and v is not None:
            setattr(game, k, v)

    if "team_a_players" in updates and updates["team_a_players"] and "team_a_name" not in updates:
        game.team_a_name = " / ".join(updates["team_a_players"])
    if "team_b_players" in updates and updates["team_b_players"] and "team_b_name" not in updates:
        game.team_b_name = " / ".join(updates["team_b_players"])

    db.add(game)
    db.commit()
    dto = GameRead.model_validate(game)
    asyncio.create_task(scoreboard_manager.broadcast_game(dto.model_dump(mode="json")))
    return dto


@router.post(
    "/{game_key}/start",
    response_model=GameRead,
    summary="Start a match and mark its assigned court Occupied",
)
async def start_game(
    game_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    game = _find_game(db, game_key, tenant_id)
    game.status = GameStatus.LIVE.value
    if not game.started_at:
        game.started_at = _now_iso()

    if game.court_id:
        court = db.get(Court, game.court_id)
        if court:
            court.status = CourtStatus.OCCUPIED.value
            db.add(court)

    events = list(game.score_events or [])
    events.append(
        {
            "id": len(events) + 1,
            "type": "START_MATCH",
            "timestamp": _now_iso(),
            "description": f"Match started on {game.court_name or 'Court'}",
            "score_a": game.score_a,
            "score_b": game.score_b,
            "serving_team": game.serving_team,
            "server_number": game.server_number,
            "game_number": game.current_game_number,
        }
    )
    game.score_events = events[-500:]
    _sync_tournament_match_result(db, game)
    db.add(game)
    db.commit()
    dto = GameRead.model_validate(game)
    asyncio.create_task(scoreboard_manager.broadcast_game(dto.model_dump(mode="json")))
    return dto


@router.post(
    "/{game_key}/score",
    response_model=GameRead,
    summary="Add a point to Team A or Team B and evaluate game/match rules",
)
async def add_point(
    game_key: str,
    payload: ScorePointRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    return apply_add_point(db, game_key, payload.team, tenant_id)


@router.post(
    "/{game_key}/server",
    response_model=GameRead,
    summary="Switch serving team or server number (side-out)",
)
async def change_server(
    game_key: str,
    payload: ServerChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    return apply_change_server(
        db, game_key, payload.serving_team, payload.server_number, tenant_id
    )


@router.post(
    "/{game_key}/undo",
    response_model=GameRead,
    summary="Undo the most recent score or server event",
)
async def undo_last_event(
    game_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    return apply_undo_event(db, game_key, tenant_id)


@router.post(
    "/{game_key}/complete",
    response_model=GameRead,
    summary="Finalize match, record winner, release court, and update tournament bracket",
)
async def complete_game(
    game_key: str,
    payload: CompleteGameRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> GameRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    return apply_complete_game(db, game_key, payload.winner_team, tenant_id)


