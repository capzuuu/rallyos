from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import GameStatus, MatchFormat, MatchType, ScoringType


class Game(TimestampMixin, Base):
    __tablename__ = "games"
    __table_args__ = (
        Index("ix_games_admin_status_date", "admin_id", "status", "scheduled_date"),
        Index(
            "ix_games_admin_court_date_status",
            "admin_id",
            "court_id",
            "scheduled_date",
            "status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    code: Mapped[str] = mapped_column(
        String(32), index=True, nullable=False
    )
    match_type: Mapped[str] = mapped_column(
        String(32), default=MatchType.DOUBLES.value, index=True, nullable=False
    )
    team_a_name: Mapped[str] = mapped_column(String(140), nullable=False)
    team_a_players: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    team_b_name: Mapped[str] = mapped_column(String(140), nullable=False)
    team_b_players: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    court_id: Mapped[int | None] = mapped_column(
        ForeignKey("courts.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    court_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    scheduled_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    start_time: Mapped[str] = mapped_column(String(10), nullable=False)
    end_time: Mapped[str] = mapped_column(String(10), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=45, nullable=False)

    match_format: Mapped[str] = mapped_column(
        String(32), default=MatchFormat.SINGLE_GAME.value, nullable=False
    )
    scoring_type: Mapped[str] = mapped_column(
        String(32), default=ScoringType.SIDE_OUT.value, nullable=False
    )
    points_to_win: Mapped[int] = mapped_column(Integer, default=11, nullable=False)
    win_by_two: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    score_a: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_b: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    games_won_a: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    games_won_b: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_game_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    set_scores: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )

    serving_team: Mapped[str] = mapped_column(String(8), default="A", nullable=False)
    server_number: Mapped[int] = mapped_column(Integer, default=2, nullable=False)

    status: Mapped[str] = mapped_column(
        String(32), default=GameStatus.UPCOMING.value, index=True, nullable=False
    )
    winner_team: Mapped[str | None] = mapped_column(String(8), nullable=True)
    started_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)

    tournament_id: Mapped[int | None] = mapped_column(
        ForeignKey("tournaments.id", ondelete="SET NULL"),
        index=True,
        nullable=True,
    )
    tournament_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    tournament_match_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    score_events: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )

