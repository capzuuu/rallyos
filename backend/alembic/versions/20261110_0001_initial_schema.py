"""Initial RallyOS Pickleball schema (users, courts, tournaments, games, platform_settings)

Revision ID: 20261110_0001
Revises:
Create Date: 2026-11-10 14:40:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20261110_0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(length=191), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("job_title", sa.String(length=120), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_role"), "users", ["role"], unique=False)

    op.create_table(
        "courts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("court_number", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("surface_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("maintenance_note", sa.Text(), nullable=True),
        sa.Column("maintenance_date", sa.String(length=20), nullable=True),
        sa.Column("maintenance_start", sa.String(length=10), nullable=True),
        sa.Column("maintenance_end", sa.String(length=10), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(
        op.f("ix_courts_court_number"), "courts", ["court_number"], unique=True
    )
    op.create_index(op.f("ix_courts_status"), "courts", ["status"], unique=False)

    op.create_table(
        "tournaments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("tournament_type", sa.String(length=64), nullable=False),
        sa.Column("match_type", sa.String(length=32), nullable=False),
        sa.Column("skill_division", sa.String(length=32), nullable=False),
        sa.Column("format", sa.String(length=40), nullable=False),
        sa.Column("registration_deadline", sa.String(length=20), nullable=False),
        sa.Column("start_date", sa.String(length=20), nullable=False),
        sa.Column("max_participants", sa.Integer(), nullable=False),
        sa.Column("entry_fee_info", sa.String(length=64), nullable=True),
        sa.Column("assigned_court_ids", sa.JSON(), nullable=False),
        sa.Column("match_format", sa.String(length=32), nullable=False),
        sa.Column("scoring_type", sa.String(length=32), nullable=False),
        sa.Column("points_to_win", sa.Integer(), nullable=False),
        sa.Column("win_by_two", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("participants", sa.JSON(), nullable=False),
        sa.Column("matches", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(op.f("ix_tournaments_code"), "tournaments", ["code"], unique=True)
    op.create_index(op.f("ix_tournaments_name"), "tournaments", ["name"], unique=False)
    op.create_index(
        op.f("ix_tournaments_start_date"), "tournaments", ["start_date"], unique=False
    )
    op.create_index(
        op.f("ix_tournaments_status"), "tournaments", ["status"], unique=False
    )

    op.create_table(
        "games",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("match_type", sa.String(length=32), nullable=False),
        sa.Column("team_a_name", sa.String(length=140), nullable=False),
        sa.Column("team_a_players", sa.JSON(), nullable=False),
        sa.Column("team_b_name", sa.String(length=140), nullable=False),
        sa.Column("team_b_players", sa.JSON(), nullable=False),
        sa.Column("court_id", sa.Integer(), nullable=True),
        sa.Column("court_name", sa.String(length=120), nullable=True),
        sa.Column("scheduled_date", sa.String(length=20), nullable=False),
        sa.Column("start_time", sa.String(length=10), nullable=False),
        sa.Column("end_time", sa.String(length=10), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("match_format", sa.String(length=32), nullable=False),
        sa.Column("scoring_type", sa.String(length=32), nullable=False),
        sa.Column("points_to_win", sa.Integer(), nullable=False),
        sa.Column("win_by_two", sa.Boolean(), nullable=False),
        sa.Column("score_a", sa.Integer(), nullable=False),
        sa.Column("score_b", sa.Integer(), nullable=False),
        sa.Column("games_won_a", sa.Integer(), nullable=False),
        sa.Column("games_won_b", sa.Integer(), nullable=False),
        sa.Column("current_game_number", sa.Integer(), nullable=False),
        sa.Column("set_scores", sa.JSON(), nullable=False),
        sa.Column("serving_team", sa.String(length=8), nullable=False),
        sa.Column("server_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("winner_team", sa.String(length=8), nullable=True),
        sa.Column("started_at", sa.String(length=40), nullable=True),
        sa.Column("completed_at", sa.String(length=40), nullable=True),
        sa.Column("tournament_id", sa.Integer(), nullable=True),
        sa.Column("tournament_name", sa.String(length=160), nullable=True),
        sa.Column("tournament_match_id", sa.String(length=64), nullable=True),
        sa.Column("score_events", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["court_id"], ["courts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["tournament_id"], ["tournaments.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )
    op.create_index(op.f("ix_games_code"), "games", ["code"], unique=True)
    op.create_index(op.f("ix_games_court_id"), "games", ["court_id"], unique=False)
    op.create_index(op.f("ix_games_match_type"), "games", ["match_type"], unique=False)
    op.create_index(
        op.f("ix_games_scheduled_date"), "games", ["scheduled_date"], unique=False
    )
    op.create_index(op.f("ix_games_status"), "games", ["status"], unique=False)
    op.create_index(
        op.f("ix_games_tournament_id"), "games", ["tournament_id"], unique=False
    )

    op.create_table(
        "platform_settings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("business", sa.JSON(), nullable=False),
        sa.Column("game_defaults", sa.JSON(), nullable=False),
        sa.Column("tournament_defaults", sa.JSON(), nullable=False),
        sa.Column("court_defaults", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
    op.drop_table("games")
    op.drop_table("tournaments")
    op.drop_table("courts")
    op.drop_table("users")
