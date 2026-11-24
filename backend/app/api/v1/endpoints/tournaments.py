from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import (
    require_roles,
    resolve_tenant_admin_id,
)
from app.core.scheduling import check_court_conflict, compute_end_time
from app.db.session import get_db
from app.models.court import Court
from app.models.enums import TournamentFormat, TournamentStatus, UserRole
from app.models.tournament import Tournament
from app.models.user import User
from app.schemas.pickleball import (
    ParticipantPayload,
    ParticipantUpdate,
    TournamentCreate,
    TournamentMatchUpdate,
    TournamentRead,
    TournamentUpdate,
)

router = APIRouter()


def _find_tournament(
    db: Session, key: str, tenant_id: int | None = None
) -> Tournament:
    if key.isdigit():
        t = db.get(Tournament, int(key))
        if t and (tenant_id is None or t.admin_id == tenant_id):
            return t
    stmt = select(Tournament).where(Tournament.code == key.upper())
    if tenant_id is not None:
        stmt = stmt.where(Tournament.admin_id == tenant_id)
    t = db.scalar(stmt.order_by(Tournament.id.desc()).limit(1))
    if not t:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tournament not found."
        )
    return t


def build_tournament_matches(
    fmt: str,
    participants: list[dict[str, Any]],
    start_date: str,
    court_ids: list[int],
) -> list[dict[str, Any]]:
    seeded = sorted(participants, key=lambda p: p.get("seed") or 999)
    names = [p["name"] for p in seeded if p.get("name")]
    if len(names) < 2:
        return []

    matches: list[dict[str, Any]] = []
    default_court = court_ids[0] if court_ids else 1

    if fmt == TournamentFormat.ROUND_ROBIN.value:
        m_num = 1
        for i in range(len(names)):
            for j in range(i + 1, len(names)):
                hour = 9 + ((m_num - 1) % 8)
                c_id = court_ids[(m_num - 1) % len(court_ids)] if court_ids else default_court
                matches.append(
                    {
                        "id": f"M-{m_num}",
                        "match_number": m_num,
                        "bracket_section": "Round Robin",
                        "round_num": ((m_num - 1) // max(1, len(names) // 2)) + 1,
                        "round_name": f"Pool Play • Match {m_num}",
                        "team_a": names[i],
                        "team_b": names[j],
                        "score_a": 0,
                        "score_b": 0,
                        "winner": None,
                        "court_id": c_id,
                        "scheduled_date": start_date,
                        "start_time": f"{hour:02d}:00",
                        "status": "Upcoming",
                    }
                )
                m_num += 1
        return matches

    # Pad to 4 or 8 for Elimination brackets
    target_size = 4 if len(names) <= 4 else 8
    while len(names) < target_size:
        names.append(f"BYE / Seed {len(names) + 1}")

    if target_size == 4:
        matches = [
            {
                "id": "M-1",
                "match_number": 1,
                "bracket_section": "Winners Bracket",
                "round_num": 1,
                "round_name": "Semifinals",
                "team_a": names[0],
                "team_b": names[3],
                "score_a": 0,
                "score_b": 0,
                "winner": None,
                "court_id": court_ids[0] if court_ids else 1,
                "scheduled_date": start_date,
                "start_time": "09:00",
                "status": "Upcoming",
                "next_win_match_id": "M-3",
                "next_win_slot": "A",
                "next_loss_match_id": "M-4" if fmt == TournamentFormat.DOUBLE_ELIMINATION.value else None,
                "next_loss_slot": "A",
            },
            {
                "id": "M-2",
                "match_number": 2,
                "bracket_section": "Winners Bracket",
                "round_num": 1,
                "round_name": "Semifinals",
                "team_a": names[1],
                "team_b": names[2],
                "score_a": 0,
                "score_b": 0,
                "winner": None,
                "court_id": court_ids[1 % len(court_ids)] if court_ids else 2,
                "scheduled_date": start_date,
                "start_time": "10:00",
                "status": "Upcoming",
                "next_win_match_id": "M-3",
                "next_win_slot": "B",
                "next_loss_match_id": "M-4" if fmt == TournamentFormat.DOUBLE_ELIMINATION.value else None,
                "next_loss_slot": "B",
            },
            {
                "id": "M-3",
                "match_number": 3,
                "bracket_section": "Winners Bracket",
                "round_num": 2,
                "round_name": "Championship Final",
                "team_a": "Winner M-1",
                "team_b": "Winner M-2",
                "score_a": 0,
                "score_b": 0,
                "winner": None,
                "court_id": court_ids[0] if court_ids else 1,
                "scheduled_date": start_date,
                "start_time": "13:00",
                "status": "Upcoming",
            },
        ]
        if fmt == TournamentFormat.DOUBLE_ELIMINATION.value:
            matches.extend(
                [
                    {
                        "id": "M-4",
                        "match_number": 4,
                        "bracket_section": "Losers Bracket",
                        "round_num": 1,
                        "round_name": "Elimination Round 1",
                        "team_a": "Loser M-1",
                        "team_b": "Loser M-2",
                        "score_a": 0,
                        "score_b": 0,
                        "winner": None,
                        "court_id": court_ids[1 % len(court_ids)] if court_ids else 2,
                        "scheduled_date": start_date,
                        "start_time": "12:00",
                        "status": "Upcoming",
                        "next_win_match_id": "M-5",
                        "next_win_slot": "B",
                    },
                    {
                        "id": "M-5",
                        "match_number": 5,
                        "bracket_section": "Grand Final",
                        "round_num": 3,
                        "round_name": "Grand Final",
                        "team_a": "Winner M-3",
                        "team_b": "Winner M-4",
                        "score_a": 0,
                        "score_b": 0,
                        "winner": None,
                        "court_id": court_ids[0] if court_ids else 1,
                        "scheduled_date": start_date,
                        "start_time": "15:00",
                        "status": "Upcoming",
                    },
                ]
            )
            matches[2]["next_win_match_id"] = "M-5"
            matches[2]["next_win_slot"] = "A"
        return matches

    # 8-team bracket
    qf_pairs = [(0, 7), (3, 4), (1, 6), (2, 5)]
    for idx, (a_idx, b_idx) in enumerate(qf_pairs):
        m_num = idx + 1
        sf_id = "M-5" if idx < 2 else "M-6"
        sf_slot = "A" if idx % 2 == 0 else "B"
        matches.append(
            {
                "id": f"M-{m_num}",
                "match_number": m_num,
                "bracket_section": "Winners Bracket",
                "round_num": 1,
                "round_name": "Quarterfinals",
                "team_a": names[a_idx],
                "team_b": names[b_idx],
                "score_a": 0,
                "score_b": 0,
                "winner": None,
                "court_id": court_ids[idx % len(court_ids)] if court_ids else (idx % 4) + 1,
                "scheduled_date": start_date,
                "start_time": f"{9 + idx:02d}:00",
                "status": "Upcoming",
                "next_win_match_id": sf_id,
                "next_win_slot": sf_slot,
            }
        )
    matches.extend(
        [
            {
                "id": "M-5",
                "match_number": 5,
                "bracket_section": "Winners Bracket",
                "round_num": 2,
                "round_name": "Semifinals",
                "team_a": "Winner M-1",
                "team_b": "Winner M-2",
                "score_a": 0,
                "score_b": 0,
                "winner": None,
                "court_id": court_ids[0] if court_ids else 1,
                "scheduled_date": start_date,
                "start_time": "13:30",
                "status": "Upcoming",
                "next_win_match_id": "M-7",
                "next_win_slot": "A",
            },
            {
                "id": "M-6",
                "match_number": 6,
                "bracket_section": "Winners Bracket",
                "round_num": 2,
                "round_name": "Semifinals",
                "team_a": "Winner M-3",
                "team_b": "Winner M-4",
                "score_a": 0,
                "score_b": 0,
                "winner": None,
                "court_id": court_ids[1 % len(court_ids)] if court_ids else 2,
                "scheduled_date": start_date,
                "start_time": "14:30",
                "status": "Upcoming",
                "next_win_match_id": "M-7",
                "next_win_slot": "B",
            },
            {
                "id": "M-7",
                "match_number": 7,
                "bracket_section": "Winners Bracket",
                "round_num": 3,
                "round_name": "Championship Final",
                "team_a": "Winner M-5",
                "team_b": "Winner M-6",
                "score_a": 0,
                "score_b": 0,
                "winner": None,
                "court_id": court_ids[0] if court_ids else 1,
                "scheduled_date": start_date,
                "start_time": "16:30",
                "status": "Upcoming",
            },
        ]
    )
    return matches


@router.get("", response_model=list[TournamentRead], summary="List all tournaments")
def list_tournaments(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> list[TournamentRead]:
    tenant_id = resolve_tenant_admin_id(current_user)
    if tenant_id is None:
        return []
    items = db.scalars(
        select(Tournament)
        .where(Tournament.admin_id == tenant_id)
        .order_by(Tournament.start_date.asc(), Tournament.id.desc())
    ).all()
    return [TournamentRead.model_validate(t) for t in items]


@router.post(
    "",
    response_model=TournamentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new pickleball tournament",
)
def create_tournament(
    payload: TournamentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    admin_filter = (
        Tournament.admin_id.is_(None)
        if tenant_id is None
        else Tournament.admin_id == tenant_id
    )
    if payload.code:
        code = payload.code.strip().upper()
        if db.scalar(
            select(Tournament.id).where(admin_filter, Tournament.code == code).limit(1)
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Tournament code {code} already exists.",
            )
    else:
        total_tournaments = (
            db.scalar(select(func.count(Tournament.id)).where(admin_filter)) or 0
        )
        seq = 201 + int(total_tournaments)
        while db.scalar(
            select(Tournament.id)
            .where(admin_filter, Tournament.code == f"TRN-{seq}")
            .limit(1)
        ):
            seq += 1
        code = f"TRN-{seq}"

    initial_participants = list(payload.participants or [])
    initial_matches = (
        build_tournament_matches(
            fmt=payload.format,
            participants=initial_participants,
            start_date=payload.start_date,
            court_ids=payload.assigned_court_ids,
        )
        if len(initial_participants) >= 2
        else []
    )

    tournament = Tournament(
        admin_id=tenant_id,
        code=code,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        tournament_type=payload.tournament_type,
        match_type=payload.match_type,
        skill_division=payload.skill_division,
        format=payload.format,
        registration_deadline=payload.registration_deadline,
        start_date=payload.start_date,
        max_participants=payload.max_participants,
        entry_fee_info=payload.entry_fee_info,
        assigned_court_ids=payload.assigned_court_ids,
        match_format=payload.match_format,
        scoring_type=payload.scoring_type,
        points_to_win=payload.points_to_win,
        win_by_two=payload.win_by_two,
        status=payload.status,
        participants=initial_participants,
        matches=initial_matches,
    )
    db.add(tournament)
    db.commit()
    db.refresh(tournament)
    return TournamentRead.model_validate(tournament)


@router.get(
    "/{tournament_key}",
    response_model=TournamentRead,
    summary="Get tournament details by ID or code",
)
def get_tournament(
    tournament_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMIN, UserRole.SCOREKEEPER)
    ),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    t = _find_tournament(db, tournament_key, tenant_id)
    return TournamentRead.model_validate(t)


@router.patch(
    "/{tournament_key}",
    response_model=TournamentRead,
    summary="Update tournament details or status",
)
def update_tournament(
    tournament_key: str,
    payload: TournamentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    t = _find_tournament(db, tournament_key, tenant_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(t, k, v)
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentRead.model_validate(t)


@router.post(
    "/{tournament_key}/participants",
    response_model=TournamentRead,
    summary="Register a player or team into the tournament",
)
def add_participant(
    tournament_key: str,
    payload: ParticipantPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    t = _find_tournament(db, tournament_key, tenant_id)
    participants = [dict(p) for p in (t.participants or [])]
    if len(participants) >= t.max_participants:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tournament is at maximum capacity ({t.max_participants}).",
        )
    next_id = max((int(p.get("id", 0)) for p in participants), default=0) + 1
    seed = payload.seed if payload.seed is not None else len(participants) + 1
    participants.append(
        {
            "id": next_id,
            "name": payload.name.strip(),
            "players": payload.players or [payload.name.strip()],
            "category": payload.category or f"{t.match_type} • {t.skill_division}",
            "seed": seed,
            "registered_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "status": payload.status,
        }
    )
    t.participants = participants
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentRead.model_validate(t)


@router.patch(
    "/{tournament_key}/participants/{participant_id}",
    response_model=TournamentRead,
    summary="Update participant seed, name, or status",
)
def update_participant(
    tournament_key: str,
    participant_id: int,
    payload: ParticipantUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    t = _find_tournament(db, tournament_key, tenant_id)
    participants = [dict(p) for p in (t.participants or [])]
    target = next((p for p in participants if int(p.get("id", 0)) == participant_id), None)
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Participant not found."
        )
    if payload.name is not None:
        target["name"] = payload.name.strip()
    if payload.players is not None:
        target["players"] = payload.players
    if payload.category is not None:
        target["category"] = payload.category
    if payload.seed is not None:
        target["seed"] = payload.seed
    if payload.registered_at is not None:
        target["registered_at"] = payload.registered_at
    if payload.status is not None:
        target["status"] = payload.status
    t.participants = participants
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentRead.model_validate(t)


@router.delete(
    "/{tournament_key}/participants/{participant_id}",
    response_model=TournamentRead,
    summary="Remove a participant from the tournament",
)
def remove_participant(
    tournament_key: str,
    participant_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    t = _find_tournament(db, tournament_key, tenant_id)
    participants = [
        dict(p)
        for p in (t.participants or [])
        if int(p.get("id", 0)) != participant_id
    ]
    t.participants = participants
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentRead.model_validate(t)


@router.post(
    "/{tournament_key}/generate-bracket",
    response_model=TournamentRead,
    summary="Generate bracket or round-robin schedule from registered participants",
)
def generate_bracket(
    tournament_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    t = _find_tournament(db, tournament_key, tenant_id)
    t.matches = build_tournament_matches(
        fmt=t.format,
        participants=t.participants or [],
        start_date=t.start_date,
        court_ids=t.assigned_court_ids or [1, 2],
    )
    if t.status in {
        TournamentStatus.DRAFT.value,
        TournamentStatus.REGISTRATION_OPEN.value,
        TournamentStatus.REGISTRATION_CLOSED.value,
    }:
        t.status = TournamentStatus.ONGOING.value
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentRead.model_validate(t)


@router.patch(
    "/{tournament_key}/matches/{match_id}",
    response_model=TournamentRead,
    summary="Update tournament match court/schedule or finalize score and advance winner",
)
def update_tournament_match(
    tournament_key: str,
    match_id: str,
    payload: TournamentMatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
) -> TournamentRead:
    tenant_id = resolve_tenant_admin_id(current_user)
    t = _find_tournament(db, tournament_key, tenant_id)
    matches = [dict(m) for m in (t.matches or [])]
    match = next((m for m in matches if str(m.get("id")) == match_id), None)
    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Tournament match not found."
        )

    updates = payload.model_dump(exclude_unset=True)
    if any(k in updates for k in ("court_id", "scheduled_date", "start_time")):
        c_id = updates.get("court_id", match.get("court_id"))
        s_date = updates.get("scheduled_date", match.get("scheduled_date") or t.start_date)
        s_time = updates.get("start_time", match.get("start_time") or "09:00")
        e_time = compute_end_time(s_time, 45)
        court = check_court_conflict(
            db, c_id, s_date, s_time, e_time, admin_id=tenant_id
        )
        match["court_id"] = court.id if court else c_id
        match["scheduled_date"] = s_date
        match["start_time"] = s_time

    if "score_a" in updates and updates["score_a"] is not None:
        match["score_a"] = updates["score_a"]
    if "score_b" in updates and updates["score_b"] is not None:
        match["score_b"] = updates["score_b"]
    if "status" in updates and updates["status"] is not None:
        match["status"] = updates["status"]
    if "game_code" in updates and updates["game_code"] is not None:
        match["game_code"] = updates["game_code"]

    if "winner" in updates and updates["winner"]:
        winner_name = updates["winner"]
        match["winner"] = winner_name
        match["status"] = "Completed"
        loser_name = (
            match["team_b"]
            if winner_name == match["team_a"]
            else match["team_a"]
        )

        next_win_id = match.get("next_win_match_id")
        next_win_slot = match.get("next_win_slot", "A")
        if next_win_id:
            nxt = next((m for m in matches if str(m.get("id")) == str(next_win_id)), None)
            if nxt:
                if next_win_slot == "A":
                    nxt["team_a"] = winner_name
                else:
                    nxt["team_b"] = winner_name

        next_loss_id = match.get("next_loss_match_id")
        next_loss_slot = match.get("next_loss_slot", "A")
        if next_loss_id:
            nxt_l = next((m for m in matches if str(m.get("id")) == str(next_loss_id)), None)
            if nxt_l:
                if next_loss_slot == "A":
                    nxt_l["team_a"] = loser_name
                else:
                    nxt_l["team_b"] = loser_name

        if all(m.get("status") == "Completed" for m in matches):
            t.status = TournamentStatus.COMPLETED.value

    t.matches = matches
    db.add(t)
    db.commit()
    db.refresh(t)
    return TournamentRead.model_validate(t)

