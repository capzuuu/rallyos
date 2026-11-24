from contextlib import contextmanager

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.realtime import scoreboard_manager
from app.db.session import SessionLocal, get_db
from app.schemas.pickleball import GameRead
from app.services.game_scoring import (
    apply_add_point,
    apply_change_server,
    apply_complete_game,
    apply_sideout,
    apply_undo_event,
    find_game,
)

router = APIRouter()


@contextmanager
def _get_scoped_db(websocket: WebSocket):
    app = getattr(websocket, "app", None)
    if app and get_db in getattr(app, "dependency_overrides", {}):
        override = app.dependency_overrides[get_db]
        gen = override()
        try:
            yield next(gen)
        finally:
            try:
                next(gen)
            except StopIteration:
                pass
    else:
        with SessionLocal() as session:
            yield session


@router.websocket("/games/{game_key}")
async def game_scoreboard_ws(websocket: WebSocket, game_key: str) -> None:
    accepted = await scoreboard_manager.connect(game_key, websocket)
    if not accepted:
        return

    # Immediately hydrate newly connected client (Live TV / Scorekeeper) with authoritative state
    try:
        with _get_scoped_db(websocket) as db:
            game = find_game(db, game_key)
            dto = GameRead.model_validate(game)
            await websocket.send_json(
                {
                    "type": "INIT_STATE",
                    "game": dto.model_dump(mode="json"),
                }
            )
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue

            msg_type = (data.get("action") or data.get("type") or "").upper()

            # Heartbeat Ping/Pong
            if msg_type == "PING":
                await websocket.send_json({"type": "PONG", "ts": data.get("ts")})
                continue

            # Instant WebSocket Scoring Action
            if msg_type == "SCORE_POINT":
                team = str(data.get("team") or "A").upper()
                try:
                    with _get_scoped_db(websocket) as db:
                        apply_add_point(db, game_key, team)
                except Exception as err:
                    await websocket.send_json({"type": "ERROR", "message": str(err)})
                continue

            # Instant Server Change
            if msg_type == "CHANGE_SERVER":
                serving_team = str(data.get("serving_team") or "A").upper()
                server_number = int(data.get("server_number") or 1)
                try:
                    with _get_scoped_db(websocket) as db:
                        apply_change_server(db, game_key, serving_team, server_number)
                except Exception as err:
                    await websocket.send_json({"type": "ERROR", "message": str(err)})
                continue

            # Instant Side-Out
            if msg_type in ("TRIGGER_SIDEOUT", "SIDEOUT"):
                try:
                    with _get_scoped_db(websocket) as db:
                        apply_sideout(db, game_key)
                except Exception as err:
                    await websocket.send_json({"type": "ERROR", "message": str(err)})
                continue

            # Instant Undo Event
            if msg_type in ("UNDO_POINT", "UNDO_EVENT", "UNDO"):
                try:
                    with _get_scoped_db(websocket) as db:
                        apply_undo_event(db, game_key)
                except Exception as err:
                    await websocket.send_json({"type": "ERROR", "message": str(err)})
                continue

            # Instant Complete Match
            if msg_type == "COMPLETE_GAME":
                winner_team = data.get("winner_team")
                try:
                    with _get_scoped_db(websocket) as db:
                        apply_complete_game(db, game_key, winner_team)
                except Exception as err:
                    await websocket.send_json({"type": "ERROR", "message": str(err)})
                continue

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        scoreboard_manager.disconnect(game_key, websocket)
