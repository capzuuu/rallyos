from fastapi.testclient import TestClient

from app.models.user import User
from tests.conftest import auth_headers_for


def test_websocket_scoring_and_live_tv_broadcast(
    client: TestClient,
    admin_user: User,
) -> None:
    admin_headers = auth_headers_for(client, admin_user.username, "Admin123!")

    # 1. Create a test court and game
    court_res = client.post(
        "/api/v1/courts",
        headers=admin_headers,
        json={"court_number": 92, "name": "Center Court WS"},
    )
    assert court_res.status_code == 201
    court_id = court_res.json()["id"]

    game_res = client.post(
        "/api/v1/games",
        headers=admin_headers,
        json={
            "court_id": court_id,
            "team_a_name": "Warriors",
            "team_b_name": "Picklers",
            "match_type": "Doubles",
            "scheduled_date": "2026-11-24",
            "start_time": "14:00",
            "duration_minutes": 60,
        },
    )
    assert game_res.status_code == 201
    game_code = game_res.json()["code"]

    # 2. Test WebSocket connection & immediate state hydration
    with client.websocket_connect(f"/api/v1/ws/games/{game_code}") as ws:
        init_msg = ws.receive_json()
        assert init_msg["type"] == "INIT_STATE"
        assert init_msg["game"]["code"] == game_code
        assert init_msg["game"]["score_a"] == 0
        assert init_msg["game"]["score_b"] == 0

        # Heartbeat Ping/Pong
        ws.send_json({"type": "PING", "ts": 1000})
        pong_msg = ws.receive_json()
        assert pong_msg["type"] == "PONG"
        assert pong_msg["ts"] == 1000

        # Scorekeeper awards point to Team A via WebSocket
        ws.send_json({"action": "SCORE_POINT", "team": "A"})
        update_1 = ws.receive_json()
        assert update_1["type"] == "GAME_UPDATE"
        assert update_1["game"]["score_a"] == 1
        assert update_1["game"]["score_b"] == 0

        # Award point to Team B via WebSocket
        ws.send_json({"action": "SCORE_POINT", "team": "B"})
        update_2 = ws.receive_json()
        assert update_2["type"] == "GAME_UPDATE"
        assert update_2["game"]["score_b"] == 1

        # Server change via WebSocket
        ws.send_json({
            "action": "CHANGE_SERVER",
            "serving_team": "A",
            "server_number": 2,
        })
        update_3 = ws.receive_json()
        assert update_3["type"] == "GAME_UPDATE"
        assert update_3["game"]["serving_team"] == "A"
        assert update_3["game"]["server_number"] == 2

        # Undo event via WebSocket
        ws.send_json({"action": "UNDO_POINT"})
        update_4 = ws.receive_json()
        assert update_4["type"] == "GAME_UPDATE"
        assert update_4["game"]["serving_team"] == "B"
