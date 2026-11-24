from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.enums import CourtStatus, CourtSurface


class Court(TimestampMixin, Base):
    __tablename__ = "courts"
    __table_args__ = (
        Index("ix_courts_admin_status", "admin_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    admin_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    court_number: Mapped[int] = mapped_column(
        Integer, index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    surface_type: Mapped[str] = mapped_column(
        String(32), default=CourtSurface.INDOOR.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default=CourtStatus.AVAILABLE.value, index=True, nullable=False
    )
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    maintenance_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    maintenance_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    maintenance_start: Mapped[str | None] = mapped_column(String(10), nullable=True)
    maintenance_end: Mapped[str | None] = mapped_column(String(10), nullable=True)

