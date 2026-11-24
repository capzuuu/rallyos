from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CourtCreate(BaseModel):
    court_number: int = Field(ge=1, le=99)
    name: str = Field(min_length=2, max_length=120)
    surface_type: str = "Indoor"
    status: str = "Available"
    is_enabled: bool = True
    maintenance_note: str | None = None
    maintenance_date: str | None = None
    maintenance_start: str | None = None
    maintenance_end: str | None = None


class CourtUpdate(BaseModel):
    court_number: int | None = Field(default=None, ge=1, le=99)
    name: str | None = Field(default=None, min_length=2, max_length=120)
    surface_type: str | None = None
    status: str | None = None
    is_enabled: bool | None = None
    maintenance_note: str | None = None
    maintenance_date: str | None = None
    maintenance_start: str | None = None
    maintenance_end: str | None = None


class CourtRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int | None = None
    court_number: int
    name: str
    surface_type: str
    status: str
    is_enabled: bool
    maintenance_note: str | None = None
    maintenance_date: str | None = None
    maintenance_start: str | None = None
    maintenance_end: str | None = None
    current_game: dict[str, Any] | None = None
    next_scheduled_match: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime


class GameCreate(BaseModel):
    code: str | None = None
    match_type: str = "Doubles"
    team_a_name: str | None = None
    team_a_players: list[str] = Field(default_factory=list, max_length=2)
    team_b_name: str | None = None
    team_b_players: list[str] = Field(default_factory=list, max_length=2)
    court_id: int | None = None
    scheduled_date: str
    start_time: str
    end_time: str | None = None
    duration_minutes: int = Field(default=45, ge=5, le=480)
    match_format: str = "Single Game"
    scoring_type: str = "Side-Out"
    points_to_win: int = 11
    win_by_two: bool = True
    tournament_id: int | None = None
    tournament_name: str | None = None
    tournament_match_id: str | None = None

    @model_validator(mode="after")
    def validate_teams(self) -> "GameCreate":
        has_a = bool(
            (self.team_a_name and self.team_a_name.strip())
            or any(p.strip() for p in self.team_a_players)
        )
        has_b = bool(
            (self.team_b_name and self.team_b_name.strip())
            or any(p.strip() for p in self.team_b_players)
        )
        if not has_a:
            raise ValueError("Team A name is required.")
        if not has_b:
            raise ValueError("Team B name is required.")
        return self


class GameUpdate(BaseModel):
    match_type: str | None = None
    team_a_name: str | None = None
    team_a_players: list[str] | None = None
    team_b_name: str | None = None
    team_b_players: list[str] | None = None
    court_id: int | None = None
    scheduled_date: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=480)
    match_format: str | None = None
    scoring_type: str | None = None
    points_to_win: int | None = None
    win_by_two: bool | None = None
    status: str | None = None


class ScorePointRequest(BaseModel):
    team: str = Field(pattern="^[AB]$")


class ServerChangeRequest(BaseModel):
    serving_team: str = Field(pattern="^[AB]$")
    server_number: int = Field(default=1, ge=1, le=2)
    reason: str = "Manual Server Switch"


class CompleteGameRequest(BaseModel):
    winner_team: str | None = Field(default=None, pattern="^[AB]$")


class GameRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int | None = None
    code: str
    match_type: str
    team_a_name: str
    team_a_players: list[str]
    team_b_name: str
    team_b_players: list[str]
    court_id: int | None = None
    court_name: str | None = None
    scheduled_date: str
    start_time: str
    end_time: str
    duration_minutes: int
    match_format: str
    scoring_type: str
    points_to_win: int
    win_by_two: bool
    score_a: int
    score_b: int
    games_won_a: int
    games_won_b: int
    current_game_number: int
    set_scores: list[dict[str, Any]]
    serving_team: str
    server_number: int
    status: str
    winner_team: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    tournament_id: int | None = None
    tournament_name: str | None = None
    tournament_match_id: str | None = None
    score_events: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class TournamentCreate(BaseModel):
    code: str | None = None
    name: str = Field(min_length=2, max_length=160)
    description: str | None = None
    tournament_type: str = "Championship"
    match_type: str = "Doubles"
    skill_division: str = "4.0+"
    format: str = "Single Elimination"
    registration_deadline: str
    start_date: str
    max_participants: int = 8
    entry_fee_info: str | None = None
    assigned_court_ids: list[int] = Field(default_factory=list)
    match_format: str = "Best of 3"
    scoring_type: str = "Side-Out"
    points_to_win: int = 11
    win_by_two: bool = True
    status: str = "Registration Open"
    participants: list[dict[str, Any]] = Field(default_factory=list)


class TournamentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tournament_type: str | None = None
    match_type: str | None = None
    skill_division: str | None = None
    format: str | None = None
    registration_deadline: str | None = None
    start_date: str | None = None
    max_participants: int | None = None
    entry_fee_info: str | None = None
    assigned_court_ids: list[int] | None = None
    match_format: str | None = None
    scoring_type: str | None = None
    points_to_win: int | None = None
    win_by_two: bool | None = None
    status: str | None = None


class ParticipantPayload(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    players: list[str] = Field(default_factory=list)
    category: str | None = None
    seed: int | None = None
    registered_at: str | None = None
    status: str = "Confirmed"


class ParticipantUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=140)
    players: list[str] | None = None
    category: str | None = None
    seed: int | None = None
    registered_at: str | None = None
    status: str | None = None


class TournamentMatchUpdate(BaseModel):
    court_id: int | None = None
    scheduled_date: str | None = None
    start_time: str | None = None
    score_a: int | None = None
    score_b: int | None = None
    winner: str | None = None
    status: str | None = None
    game_code: str | None = None


class TournamentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    admin_id: int | None = None
    code: str
    name: str
    description: str | None = None
    tournament_type: str
    match_type: str
    skill_division: str
    format: str
    registration_deadline: str
    start_date: str
    max_participants: int
    entry_fee_info: str | None = None
    assigned_court_ids: list[int]
    match_format: str
    scoring_type: str
    points_to_win: int
    win_by_two: bool
    status: str
    participants: list[dict[str, Any]]
    matches: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class PlatformSettingsPayload(BaseModel):
    business: dict[str, Any] | None = None
    game_defaults: dict[str, Any] | None = None
    tournament_defaults: dict[str, Any] | None = None
    court_defaults: dict[str, Any] | None = None

