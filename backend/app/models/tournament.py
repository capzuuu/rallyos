from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import (
    MatchFormat,
    MatchType,
    ScoringType,
    TournamentFormat,
    TournamentStatus,
)


class Tournament(TimestampMixin, Base):
    __tablename__ = "tournaments"
    __table_args__ = (
        Index("ix_tournaments_admin_start_date", "admin_id", "start_date"),
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
    name: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    tournament_type: Mapped[str] = mapped_column(
        String(64), default="Championship", nullable=False
    )
    match_type: Mapped[str] = mapped_column(
        String(32), default=MatchType.DOUBLES.value, nullable=False
    )
    skill_division: Mapped[str] = mapped_column(
        String(32), default="4.0+", nullable=False
    )
    format: Mapped[str] = mapped_column(
        String(40), default=TournamentFormat.SINGLE_ELIMINATION.value, nullable=False
    )
    registration_deadline: Mapped[str] = mapped_column(String(20), nullable=False)
    start_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    max_participants: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    entry_fee_info: Mapped[str | None] = mapped_column(String(64), nullable=True)

    assigned_court_ids: Mapped[list[int]] = mapped_column(
        JSON, default=list, nullable=False
    )
    match_format: Mapped[str] = mapped_column(
        String(32), default=MatchFormat.BEST_OF_3.value, nullable=False
    )
    scoring_type: Mapped[str] = mapped_column(
        String(32), default=ScoringType.SIDE_OUT.value, nullable=False
    )
    points_to_win: Mapped[int] = mapped_column(Integer, default=11, nullable=False)
    win_by_two: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    status: Mapped[str] = mapped_column(
        String(32),
        default=TournamentStatus.REGISTRATION_OPEN.value,
        index=True,
        nullable=False,
    )

    participants: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    matches: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )

