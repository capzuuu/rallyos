import asyncio
from typing import Any

from fastapi import WebSocket

from app.core.config import settings


class ScoreboardConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    @property
    def total_connections(self) -> int:
        return sum(len(sockets) for sockets in self._connections.values())

    async def connect(self, game_key: str, websocket: WebSocket) -> bool:
        key = game_key.strip().upper()
        if not key or len(key) > 64:
            await websocket.close(code=1008, reason="Invalid game identifier.")
            return False

        room = self._connections.get(key, [])
        if (
            len(room) >= settings.WS_MAX_CONNECTIONS_PER_GAME
            or self.total_connections >= settings.WS_MAX_TOTAL_CONNECTIONS
        ):
            await websocket.close(code=1008, reason="Too many scoreboard listeners.")
            return False

        await websocket.accept()
        self._connections.setdefault(key, []).append(websocket)
        return True

    def disconnect(self, game_key: str, websocket: WebSocket) -> None:
        key = game_key.strip().upper()
        if key in self._connections:
            remaining = [ws for ws in self._connections[key] if ws is not websocket]
            if remaining:
                self._connections[key] = remaining
            else:
                self._connections.pop(key, None)

    async def _send_with_timeout(
        self, key: str, websocket: WebSocket, payload: dict[str, Any]
    ) -> WebSocket | None:
        try:
            await asyncio.wait_for(websocket.send_json(payload), timeout=2.0)
            return None
        except Exception:
            return websocket

    async def broadcast_game(self, game_data: dict[str, Any]) -> None:
        keys = {
            str(game_data.get("id", "")).upper(),
            str(game_data.get("code", "")).upper(),
        }
        payload = {"type": "GAME_UPDATE", "game": game_data}

        for key in keys:
            if not key or key not in self._connections:
                continue
            targets = list(self._connections[key])
            if not targets:
                continue
            results = await asyncio.gather(
                *(self._send_with_timeout(key, ws, payload) for ws in targets),
                return_exceptions=True,
            )
            for res in results:
                if isinstance(res, WebSocket):
                    self.disconnect(key, res)


scoreboard_manager = ScoreboardConnectionManager()
