from fastapi.testclient import TestClient

from app.core.config import settings


def test_register_login_refresh_and_change_password(client: TestClient) -> None:
    register_res = client.post(
        "/api/v1/auth/register",
        json={
            "username": "Referee_Alex",
            "full_name": "Alex Referee",
            "job_title": "Scorekeeper",
            "password": "Password123!",
        },
    )
    assert register_res.status_code == 201
    assert register_res.headers.get("cache-control") == "no-store"
    reg_data = register_res.json()
    assert reg_data["user"]["username"] == "referee_alex"
    assert reg_data["user"]["role"] == "admin"
    assert "access_token" in reg_data
    assert "refresh_token" in reg_data

    headers = {"Authorization": f"Bearer {reg_data['access_token']}"}
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["full_name"] == "Alex Referee"

    # Refresh token flow
    refresh_res = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": reg_data["refresh_token"]},
    )
    assert refresh_res.status_code == 200
    assert "access_token" in refresh_res.json()

    # Change password and re-authenticate
    pw_res = client.post(
        "/api/v1/auth/change-password",
        headers=headers,
        json={
            "current_password": "Password123!",
            "new_password": "NewPassword456!",
        },
    )
    assert pw_res.status_code == 200

    bad_login = client.post(
        "/api/v1/auth/login",
        json={"username": "referee_alex", "password": "Password123!"},
    )
    assert bad_login.status_code == 401

    good_login = client.post(
        "/api/v1/auth/login",
        json={"username": "referee_alex", "password": "NewPassword456!"},
    )
    assert good_login.status_code == 200


def test_login_rate_limiting_and_registration_toggle(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "AUTH_RATE_LIMIT_MAX_ATTEMPTS", 3)
    for _ in range(3):
        res = client.post(
            "/api/v1/auth/login",
            json={"username": "nonexistent", "password": "wrong"},
        )
        assert res.status_code == 401

    throttled = client.post(
        "/api/v1/auth/login",
        json={"username": "nonexistent", "password": "wrong"},
    )
    assert throttled.status_code == 429
    assert int(throttled.headers.get("retry-after", "0")) >= 1

    monkeypatch.setattr(settings, "ALLOW_PUBLIC_REGISTER", False)
    disabled_reg = client.post(
        "/api/v1/auth/register",
        json={
            "username": "blocked_user",
            "full_name": "Blocked User",
            "password": "Password123!",
        },
    )
    assert disabled_reg.status_code == 403


def test_google_oauth_login_and_provisioning(client: TestClient) -> None:
    # 1. New Google sign-in should provision user
    google_res = client.post(
        "/api/v1/auth/google",
        json={
            "email": "pickleball_pro@gmail.com",
            "full_name": "Pickleball Pro",
            "supabase_uid": "sb-uid-12345",
        },
    )
    assert google_res.status_code == 200
    data = google_res.json()
    assert data["user"]["email"] == "pickleball_pro@gmail.com"
    assert data["user"]["full_name"] == "Pickleball Pro"
    assert data["user"]["role"] == "admin"
    assert "access_token" in data

    # 2. Subsequent Google sign-in with same email should return existing user
    repeat_res = client.post(
        "/api/v1/auth/google",
        json={
            "email": "pickleball_pro@gmail.com",
            "full_name": "Pickleball Pro Updated",
        },
    )
    assert repeat_res.status_code == 200
    repeat_data = repeat_res.json()
    assert repeat_data["user"]["id"] == data["user"]["id"]

