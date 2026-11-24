from fastapi.testclient import TestClient

from app.models.user import User
from tests.conftest import auth_headers_for


def test_courts_games_live_scoring_and_tournaments(
    client: TestClient,
    admin_user: User,
    member_user: User,
) -> None:
    # 0. Verify unauthenticated access is blocked on private/mutation routes
    assert client.get("/api/v1/courts").status_code == 401
    assert client.get("/api/v1/games").status_code == 401
    assert client.get("/api/v1/tournaments").status_code == 401
    assert client.get("/api/v1/settings").status_code == 401
    assert (
        client.post(
            "/api/v1/courts",
            json={"court_number": 1, "name": "Unauth Court"},
        ).status_code
        == 401
    )
    assert client.patch("/api/v1/settings", json={"business": {"club_name": "X"}}).status_code == 401

    admin_headers = auth_headers_for(client, admin_user.username, "Admin123!")
    scorer_headers = auth_headers_for(client, member_user.username, "Member123!")

    # Scorekeeper cannot create courts, games, tournaments, or edit platform settings
    assert (
        client.post(
            "/api/v1/courts",
            headers=scorer_headers,
            json={"court_number": 9, "name": "Blocked"},
        ).status_code
        == 403
    )
    assert (
        client.patch(
            "/api/v1/settings",
            headers=scorer_headers,
            json={"business": {"club_name": "Blocked"}},
        ).status_code
        == 403
    )

    # 1. Create a Court (Admin)
    court_res = client.post(
        "/api/v1/courts",
        headers=admin_headers,
        json={
            "court_number": 1,
            "name": "Court 1 — Championship",
            "surface_type": "Indoor",
            "status": "Available",
        },
    )
    assert court_res.status_code == 201
    court_id = court_res.json()["id"]

    # 2. Create a Game on Court 1 (Admin)
    game_res = client.post(
        "/api/v1/games",
        headers=admin_headers,
        json={
            "match_type": "Doubles",
            "team_a_players": ["Ben Johns", "Anna Leigh Waters"],
            "team_b_players": ["Riley Newman", "Matt Wright"],
            "court_id": court_id,
            "scheduled_date": "2026-11-10",
            "start_time": "10:00",
            "duration_minutes": 45,
            "match_format": "Single Game",
            "scoring_type": "Side-Out",
            "points_to_win": 11,
            "win_by_two": True,
        },
    )
    assert game_res.status_code == 201
    game = game_res.json()
    game_code = game["code"]
    assert game["team_a_name"] == "Ben Johns / Anna Leigh Waters"

    # Unauthenticated mutation on a game must fail with 401
    assert (
        client.post(f"/api/v1/games/{game_code}/score", json={"team": "A"}).status_code
        == 401
    )

    # Unauthenticated read on single game remains allowed for public TV scoreboard
    public_tv_res = client.get(f"/api/v1/games/{game_code}")
    assert public_tv_res.status_code == 200
    assert public_tv_res.json()["code"] == game_code

    # 3. Conflict check: overlapping time on Court 1 is rejected with 409
    conflict_res = client.post(
        "/api/v1/games",
        headers=admin_headers,
        json={
            "match_type": "Singles",
            "team_a_players": ["Player 1"],
            "team_b_players": ["Player 2"],
            "court_id": court_id,
            "scheduled_date": "2026-11-10",
            "start_time": "10:15",
            "duration_minutes": 45,
        },
    )
    assert conflict_res.status_code == 409

    # 4. Start game, add points, undo point, and complete match (Scorekeeper)
    start_res = client.post(
        f"/api/v1/games/{game_code}/start", headers=scorer_headers
    )
    assert start_res.status_code == 200
    assert start_res.json()["status"] == "Live"

    pt1 = client.post(
        f"/api/v1/games/{game_code}/score",
        headers=scorer_headers,
        json={"team": "A"},
    )
    assert pt1.status_code == 200
    assert pt1.json()["score_a"] == 1

    pt2 = client.post(
        f"/api/v1/games/{game_code}/score",
        headers=scorer_headers,
        json={"team": "B"},
    )
    assert pt2.status_code == 200
    assert pt2.json()["score_b"] == 1
    assert pt2.json()["serving_team"] == "B"

    undo_res = client.post(
        f"/api/v1/games/{game_code}/undo", headers=scorer_headers
    )
    assert undo_res.status_code == 200
    assert undo_res.json()["score_b"] == 0
    assert undo_res.json()["score_a"] == 1

    comp_res = client.post(
        f"/api/v1/games/{game_code}/complete",
        headers=scorer_headers,
        json={"winner_team": "A"},
    )
    assert comp_res.status_code == 200
    assert comp_res.json()["status"] == "Completed"
    assert comp_res.json()["winner_team"] == "A"

    # 5. Tournament creation, participants, bracket generation, and winner advancement (Admin)
    trn_res = client.post(
        "/api/v1/tournaments",
        headers=admin_headers,
        json={
            "name": "Club Championship",
            "match_type": "Doubles",
            "skill_division": "4.0+",
            "format": "Single Elimination",
            "registration_deadline": "2026-11-10",
            "start_date": "2026-11-12",
            "max_participants": 4,
            "assigned_court_ids": [court_id],
        },
    )
    assert trn_res.status_code == 201
    trn_code = trn_res.json()["code"]

    for idx, team_name in enumerate(["Alpha", "Bravo", "Charlie", "Delta"], start=1):
        p_res = client.post(
            f"/api/v1/tournaments/{trn_code}/participants",
            headers=admin_headers,
            json={"name": team_name, "seed": idx},
        )
        assert p_res.status_code == 200

    gen_res = client.post(
        f"/api/v1/tournaments/{trn_code}/generate-bracket",
        headers=admin_headers,
    )
    assert gen_res.status_code == 200
    matches = gen_res.json()["matches"]
    assert len(matches) == 3

    # Finalize Semifinal M-1 -> winner advances to M-3 slot A
    m1_res = client.patch(
        f"/api/v1/tournaments/{trn_code}/matches/M-1",
        headers=admin_headers,
        json={"score_a": 11, "score_b": 5, "winner": "Alpha"},
    )
    assert m1_res.status_code == 200
    updated_matches = m1_res.json()["matches"]
    final_match = next(m for m in updated_matches if m["id"] == "M-3")
    assert final_match["team_a"] == "Alpha"
