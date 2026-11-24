import asyncio
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.realtime import scoreboard_manager
from app.models.court import Court
from app.models.enums import CourtStatus, GameStatus, MatchFormat
from app.models.game import Game
from app.models.tournament import Tournament
from app.schemas.pickleball import GameRead


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def find_game(
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


def apply_add_point(
    db: Session,
    game_key: str,
    team: str,
    tenant_id: int | None = None,
) -> GameRead:
    game = find_game(db, game_key, tenant_id)
    if game.status == GameStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Match is already completed.",
        )

    if game.status == GameStatus.UPCOMING.value:
        game.status = GameStatus.LIVE.value
        game.started_at = _now_iso()

    prev_snapshot = {
        "score_a": game.score_a,
        "score_b": game.score_b,
        "games_won_a": game.games_won_a,
        "games_won_b": game.games_won_b,
        "current_game_number": game.current_game_number,
        "set_scores": list(game.set_scores or []),
        "serving_team": game.serving_team,
        "server_number": game.server_number,
    }

    if team == "A":
        game.score_a += 1
        team_label = game.team_a_name
    else:
        game.score_b += 1
        team_label = game.team_b_name

    if game.serving_team != team:
        game.serving_team = team
        game.server_number = 1

    set_winner = _is_set_won(
        game.score_a, game.score_b, game.points_to_win, game.win_by_two
    )
    required_sets = _required_sets_to_win(game.match_format)
    event_desc = f"Point awarded to {team_label} ({game.score_a}-{game.score_b})"

    if set_winner and required_sets > 1:
        sets = list(game.set_scores or [])
        sets.append(
            {
                "game": game.current_game_number,
                "score_a": game.score_a,
                "score_b": game.score_b,
                "winner": set_winner,
            }
        )
        game.set_scores = sets
        if set_winner == "A":
            game.games_won_a += 1
        else:
            game.games_won_b += 1

        if game.games_won_a < required_sets and game.games_won_b < required_sets:
            event_desc = (
                f"Game {game.current_game_number} won by {team_label} "
                f"({game.score_a}-{game.score_b})"
            )
            game.current_game_number += 1
            game.score_a = 0
            game.score_b = 0
            game.serving_team = set_winner
            game.server_number = 2 if game.match_type == "Doubles" else 1

    events = list(game.score_events or [])
    events.append(
        {
            "id": len(events) + 1,
            "type": "POINT",
            "team": team,
            "timestamp": _now_iso(),
            "description": event_desc,
            "score_a": game.score_a,
            "score_b": game.score_b,
            "serving_team": game.serving_team,
            "server_number": game.server_number,
            "game_number": game.current_game_number,
            "prev": prev_snapshot,
        }
    )
    game.score_events = events[-500:]
    _sync_tournament_match_result(db, game)
    db.add(game)

    dto = GameRead.model_validate(game)
    # Broadcast to TV and Scorekeeper WebSocket room IMMEDIATELY (zero perceived latency)
    asyncio.create_task(scoreboard_manager.broadcast_game(dto.model_dump(mode="json")))
    db.commit()
    return dto


def apply_change_server(
    db: Session,
    game_key: str,
    serving_team: str,
    server_number: int,
    tenant_id: int | None = None,
) -> GameRead:
    game = find_game(db, game_key, tenant_id)
    prev_snapshot = {
        "score_a": game.score_a,
        "score_b": game.score_b,
        "games_won_a": game.games_won_a,
        "games_won_b": game.games_won_b,
        "current_game_number": game.current_game_number,
        "set_scores": list(game.set_scores or []),
        "serving_team": game.serving_team,
        "server_number": game.server_number,
    }

    game.serving_team = serving_team
    game.server_number = server_number
    srv_name = game.team_a_name if serving_team == "A" else game.team_b_name

    events = list(game.score_events or [])
    events.append(
        {
            "id": len(events) + 1,
            "type": "SERVER_CHANGE",
            "timestamp": _now_iso(),
            "description": f"Serve to {srv_name} (Server #{server_number})",
            "score_a": game.score_a,
            "score_b": game.score_b,
            "serving_team": game.serving_team,
            "server_number": game.server_number,
            "game_number": game.current_game_number,
            "prev": prev_snapshot,
        }
    )
    game.score_events = events[-500:]
    db.add(game)

    dto = GameRead.model_validate(game)
    asyncio.create_task(scoreboard_manager.broadcast_game(dto.model_dump(mode="json")))
    db.commit()
    return dto


def apply_sideout(
    db: Session,
    game_key: str,
    tenant_id: int | None = None,
) -> GameRead:
    game = find_game(db, game_key, tenant_id)
    if game.match_type == "Doubles" and game.server_number == 1:
        next_team = game.serving_team
        next_server = 2
    else:
        next_team = "B" if game.serving_team == "A" else "A"
        next_server = 1

    return apply_change_server(db, game_key, next_team, next_server, tenant_id)


def apply_undo_event(
    db: Session,
    game_key: str,
    tenant_id: int | None = None,
) -> GameRead:
    game = find_game(db, game_key, tenant_id)
    events = list(game.score_events or [])
    reversible_idx = next(
        (
            i
            for i in range(len(events) - 1, -1, -1)
            if events[i].get("prev") is not None
        ),
        None,
    )
    if reversible_idx is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No score event available to undo.",
        )

    popped = events.pop(reversible_idx)
    prev = popped.get("prev") or {}
    game.score_a = prev.get("score_a", game.score_a)
    game.score_b = prev.get("score_b", game.score_b)
    game.games_won_a = prev.get("games_won_a", game.games_won_a)
    game.games_won_b = prev.get("games_won_b", game.games_won_b)
    game.current_game_number = prev.get(
        "current_game_number", game.current_game_number
    )
    game.set_scores = list(prev.get("set_scores", game.set_scores or []))
    game.serving_team = prev.get("serving_team", game.serving_team)
    game.server_number = prev.get("server_number", game.server_number)
    game.score_events = events
    _sync_tournament_match_result(db, game)
    db.add(game)

    dto = GameRead.model_validate(game)
    asyncio.create_task(scoreboard_manager.broadcast_game(dto.model_dump(mode="json")))
    db.commit()
    return dto


def apply_complete_game(
    db: Session,
    game_key: str,
    winner_team: str | None = None,
    tenant_id: int | None = None,
) -> GameRead:
    game = find_game(db, game_key, tenant_id)

    winner = winner_team
    if not winner:
        if game.games_won_a > game.games_won_b:
            winner = "A"
        elif game.games_won_b > game.games_won_a:
            winner = "B"
        else:
            winner = "A" if game.score_a >= game.score_b else "B"

    game.winner_team = winner
    game.status = GameStatus.COMPLETED.value
    game.completed_at = _now_iso()

    sets = list(game.set_scores or [])
    if not sets or sets[-1].get("game") != game.current_game_number:
        sets.append(
            {
                "game": game.current_game_number,
                "score_a": game.score_a,
                "score_b": game.score_b,
                "winner": winner,
            }
        )
        game.set_scores = sets
        if winner == "A":
            game.games_won_a = max(1, game.games_won_a)
        else:
            game.games_won_b = max(1, game.games_won_b)

    if game.court_id:
        court = db.get(Court, game.court_id)
        if court and court.status == CourtStatus.OCCUPIED.value:
            court.status = CourtStatus.AVAILABLE.value
            db.add(court)

    winner_name = game.team_a_name if winner == "A" else game.team_b_name
    events = list(game.score_events or [])
    events.append(
        {
            "id": len(events) + 1,
            "type": "COMPLETE_MATCH",
            "timestamp": _now_iso(),
            "description": f"Match completed — Winner: {winner_name} ({game.score_a}-{game.score_b})",
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

    dto = GameRead.model_validate(game)
    asyncio.create_task(scoreboard_manager.broadcast_game(dto.model_dump(mode="json")))
    db.commit()
    return dto
