from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    courts,
    games,
    settings_ep,
    super_admin,
    tournaments,
    users,
    ws,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(
    super_admin.router, prefix="/super-admin", tags=["Super Admin"]
)
api_router.include_router(courts.router, prefix="/courts", tags=["Courts"])
api_router.include_router(games.router, prefix="/games", tags=["Games & Live Scoring"])
api_router.include_router(tournaments.router, prefix="/tournaments", tags=["Tournaments"])
api_router.include_router(settings_ep.router, prefix="/settings", tags=["Settings"])
api_router.include_router(ws.router, prefix="/ws", tags=["Real-Time Scoreboard WebSocket"])
