from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.seed import DEFAULT_ADMINS, seed_database
from app.models.court import Court
from app.models.enums import UserRole
from app.models.game import Game
from app.models.tournament import Tournament
from app.models.user import User


def test_seed_is_idempotent(db_session: Session) -> None:
    seed_database(db_session)
    first_users = db_session.scalar(select(func.count(User.id)))
    first_courts = db_session.scalar(select(func.count(Court.id)))
    first_games = db_session.scalar(select(func.count(Game.id)))
    first_tournaments = db_session.scalar(select(func.count(Tournament.id)))
    roles = set(db_session.scalars(select(User.role)).all())

    assert first_users == len(DEFAULT_ADMINS) + 1
    assert roles == {UserRole.ADMIN.value, UserRole.SUPER_ADMIN.value}
    assert first_courts == 0
    assert first_games == 0
    assert first_tournaments == 0

    seed_database(db_session)
    assert db_session.scalar(select(func.count(User.id))) == first_users
    assert db_session.scalar(select(func.count(Court.id))) == first_courts
    assert db_session.scalar(select(func.count(Game.id))) == first_games
    assert db_session.scalar(select(func.count(Tournament.id))) == first_tournaments


def test_health_endpoint_shape(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["app"] == "RallyOS API"
    assert body["status"] in {"ok", "degraded"}
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert res.headers.get("permissions-policy") is not None


def test_cors_allows_ip_address_origins(client: TestClient) -> None:
    lan_res = client.get(
        "/health", headers={"Origin": "http://192.168.100.28:5173"}
    )
    assert lan_res.status_code == 200
    assert (
        lan_res.headers.get("access-control-allow-origin")
        == "http://192.168.100.28:5173"
    )

    loopback_res = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://127.0.0.1:4173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert loopback_res.status_code == 200
    assert (
        loopback_res.headers.get("access-control-allow-origin")
        == "http://127.0.0.1:4173"
    )

    untrusted_res = client.get(
        "/health", headers={"Origin": "https://untrusted.example"}
    )
    assert untrusted_res.headers.get("access-control-allow-origin") is None
