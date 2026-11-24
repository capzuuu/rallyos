from fastapi.testclient import TestClient

from app.models.user import User
from tests.conftest import auth_headers_for


def test_rbac_user_management(
    client: TestClient, admin_user: User, member_user: User
) -> None:
    member_headers = auth_headers_for(client, member_user.username, "Member123!")
    admin_headers = auth_headers_for(client, admin_user.username, "Admin123!")

    forbidden = client.get("/api/v1/users", headers=member_headers)
    assert forbidden.status_code == 403

    users_res = client.get("/api/v1/users", headers=admin_headers)
    assert users_res.status_code == 200
    assert users_res.json()["total"] == 2

    create_res = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "username": "scorer2",
            "full_name": "Court Scorekeeper Two",
            "role": "scorekeeper",
            "password": "Scorekeeper123!",
        },
    )
    assert create_res.status_code == 201
    assert create_res.json()["role"] == "scorekeeper"

    rejected_staff = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "username": "staff_removed",
            "full_name": "Deprecated Staff",
            "role": "staff",
            "password": "Staff123!",
        },
    )
    assert rejected_staff.status_code == 422

    # Regular Administrator cannot create another Administrator or Super Admin
    forbidden_admin_create = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "username": "admin_blocked",
            "full_name": "Blocked Admin",
            "role": "admin",
            "password": "Admin123!",
        },
    )
    assert forbidden_admin_create.status_code == 403

    # Scorekeeper and regular Admin cannot access Super Admin monitor endpoints
    assert (
        client.get("/api/v1/super-admin/admins", headers=member_headers).status_code
        == 403
    )
    forbidden_sa = client.get("/api/v1/super-admin/admins", headers=admin_headers)
    assert forbidden_sa.status_code == 403


def test_super_admin_monitors_and_manages_only_admins(
    client: TestClient,
    super_admin_user: User,
    admin_user: User,
    member_user: User,
) -> None:
    sa_headers = auth_headers_for(client, super_admin_user.username, "SuperAdmin123!")

    # Super Admin is blocked from regular Admin/Club operational & scoring endpoints
    assert client.get("/api/v1/users", headers=sa_headers).status_code == 403
    assert client.get("/api/v1/users/directory", headers=sa_headers).status_code == 403
    assert client.get("/api/v1/courts", headers=sa_headers).status_code == 403
    assert client.get("/api/v1/games", headers=sa_headers).status_code == 403
    assert client.get("/api/v1/tournaments", headers=sa_headers).status_code == 403
    assert client.get("/api/v1/settings", headers=sa_headers).status_code == 403
    assert (
        client.post(
            "/api/v1/courts",
            headers=sa_headers,
            json={"court_number": 9, "name": "Blocked Court"},
        ).status_code
        == 403
    )

    # Monitor existing Admin accounts (excludes scorekeepers)
    mon_res = client.get("/api/v1/super-admin/admins", headers=sa_headers)
    assert mon_res.status_code == 200
    body = mon_res.json()
    assert body["total"] == 1
    assert body["items"][0]["username"] == admin_user.username
    assert body["items"][0]["stats"]["scorekeepers_count"] == 1
    assert body["summary"]["total_admins"] == 1

    # Create a new Administrator account
    create_res = client.post(
        "/api/v1/super-admin/admins",
        headers=sa_headers,
        json={
            "username": "club_admin_new",
            "full_name": "New Club Admin",
            "job_title": "Club Owner",
            "password": "ClubAdmin123!",
        },
    )
    assert create_res.status_code == 201
    new_admin = create_res.json()
    assert new_admin["role"] == "admin"

    # Cannot manage Scorekeepers via Super Admin admin-monitor endpoints
    non_admin_patch = client.patch(
        f"/api/v1/super-admin/admins/{member_user.id}",
        headers=sa_headers,
        json={"is_active": False},
    )
    assert non_admin_patch.status_code == 404

    # Suspend & reactivate the created Administrator
    susp_res = client.patch(
        f"/api/v1/super-admin/admins/{new_admin['id']}",
        headers=sa_headers,
        json={"is_active": False},
    )
    assert susp_res.status_code == 200
    assert susp_res.json()["is_active"] is False

    # Delete the created Administrator
    del_res = client.delete(
        f"/api/v1/super-admin/admins/{new_admin['id']}", headers=sa_headers
    )
    assert del_res.status_code == 200
