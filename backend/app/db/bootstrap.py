import sys
from pathlib import Path

import pymysql
from alembic import command
from alembic.config import Config

from app.core.config import settings
from app.db.seed import seed_database
from app.db.session import SessionLocal


def ensure_mysql_database_exists() -> None:
    if not settings.sqlalchemy_database_uri.startswith("mysql"):
        return

    conn = pymysql.connect(
        host=settings.MYSQL_HOST,
        port=settings.MYSQL_PORT,
        user=settings.MYSQL_USER,
        password=settings.MYSQL_PASSWORD,
        charset="utf8mb4",
        connect_timeout=5,
    )
    try:
        with conn.cursor() as cursor:
            db_name = settings.MYSQL_DATABASE.replace("`", "")
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
            )
        conn.commit()
        print(f"Verified MySQL database '{settings.MYSQL_DATABASE}' on {settings.MYSQL_HOST}:{settings.MYSQL_PORT}.")
    finally:
        conn.close()


def run_alembic_migrations() -> None:
    backend_dir = Path(__file__).resolve().parents[2]
    alembic_ini = backend_dir / "alembic.ini"
    alembic_cfg = Config(str(alembic_ini))
    alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    command.upgrade(alembic_cfg, "head")
    print("Alembic migrations applied (head).")


def bootstrap() -> int:
    try:
        ensure_mysql_database_exists()
        run_alembic_migrations()
        with SessionLocal() as db:
            seed_database(db)
        print("RallyOS database bootstrap and seed completed successfully.")
        return 0
    except Exception as exc:
        print(f"Database bootstrap failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(bootstrap())
