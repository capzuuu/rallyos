from typing import Any

from sqlalchemy import ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class PlatformSettings(TimestampMixin, Base):
    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    business: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    game_defaults: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    tournament_defaults: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    court_defaults: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )

