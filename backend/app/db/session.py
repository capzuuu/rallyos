from collections.abc import Generator
from typing import Any

import pymysql
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings


def _build_mysql_connect_args() -> dict[str, Any]:
    args: dict[str, Any] = {"connect_timeout": 5}
    if settings.DB_SSL_CA:
        args["ssl"] = {"ca": settings.DB_SSL_CA}
    return args


def _attach_sqlite_pragmas(target_engine) -> None:
    if target_engine.dialect.name != "sqlite":
        return

    @event.listens_for(target_engine, "connect")
    def _on_sqlite_connect(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


_uri = settings.sqlalchemy_database_uri
_is_mysql = _uri.startswith("mysql")
_is_postgres = _uri.startswith("postgresql")

if _is_mysql:
    engine = create_engine(
        _uri,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        connect_args=_build_mysql_connect_args(),
        echo=False,
    )
elif _uri.startswith("sqlite"):
    engine = create_engine(
        _uri,
        connect_args={"check_same_thread": False},
        echo=False,
    )
    _attach_sqlite_pragmas(engine)
else:
    engine = create_engine(
        _uri,
        pool_pre_ping=True,
        pool_recycle=1800,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_timeout=settings.DB_POOL_TIMEOUT,
        echo=False,
    )

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    bind=engine,
    class_=Session,
)

active_db_backend = "supabase postgres" if _is_postgres else ("mysql" if _is_mysql else "sqlite")


def _sqlite_rebuild_table_without_unique(
    target_engine, table_name: str, create_sql_template: str
) -> None:
    """Rebuild a SQLite table without legacy inline UNIQUE constraints while preserving all rows."""
    temp_name = f"_{table_name}_migrated_tmp"
    with target_engine.begin() as conn:
        cols = [
            row[1]
            for row in conn.execute(text(f'PRAGMA table_info("{table_name}")')).fetchall()
        ]
        col_list = ", ".join(f'"{c}"' for c in cols)
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text(f'DROP TABLE IF EXISTS "{temp_name}"'))
        conn.execute(text(create_sql_template.format(table_name=temp_name)))
        conn.execute(
            text(
                f'INSERT INTO "{temp_name}" ({col_list}) SELECT {col_list} FROM "{table_name}"'
            )
        )
        conn.execute(text(f'DROP TABLE "{table_name}"'))
        conn.execute(text(f'ALTER TABLE "{temp_name}" RENAME TO "{table_name}"'))
        conn.execute(text("PRAGMA foreign_keys=ON"))


def _sqlite_unique_single_col_indexes(conn, table_name: str, column_name: str) -> tuple[bool, list[str]]:
    """Return (has_autoindex, named_unique_indexes) on a SQLite single column."""
    has_auto = False
    named: list[str] = []
    idx_rows = conn.execute(text(f'PRAGMA index_list("{table_name}")')).fetchall()
    for row in idx_rows:
        idx_name = row[1]
        is_unique = bool(row[2])
        origin = row[3] if len(row) > 3 else ""
        if not is_unique:
            continue
        info_rows = conn.execute(text(f'PRAGMA index_info("{idx_name}")')).fetchall()
        idx_cols = [ir[2] for ir in info_rows]
        if idx_cols == [column_name]:
            if origin == "u" or str(idx_name).startswith("sqlite_autoindex_"):
                has_auto = True
            else:
                named.append(str(idx_name))
    return has_auto, named


def _drop_single_col_unique_indexes(target_engine, insp, table_name: str, column_name: str) -> None:
    """Drop any legacy global UNIQUE index on a single column (for both MySQL and SQLite)."""
    dialect = target_engine.dialect.name
    unique_index_names: set[str] = set()

    if dialect == "mysql":
        with target_engine.begin() as conn:
            rows = conn.execute(text(f"SHOW INDEX FROM `{table_name}`")).fetchall()
            by_key: dict[str, tuple[bool, list[str]]] = {}
            for r in rows:
                non_unique = int(r[1])
                key_name = str(r[2])
                col_name = str(r[4])
                if key_name == "PRIMARY":
                    continue
                is_u = non_unique == 0
                if key_name not in by_key:
                    by_key[key_name] = (is_u, [])
                by_key[key_name][1].append(col_name)
            for key_name, (is_u, cols) in by_key.items():
                if is_u and cols == [column_name]:
                    unique_index_names.add(key_name)
            for idx_name in unique_index_names:
                safe_idx = idx_name.replace("`", "")
                conn.execute(text(f"ALTER TABLE `{table_name}` DROP INDEX `{safe_idx}`"))
        return

    for idx in insp.get_indexes(table_name):
        if idx.get("unique") and idx.get("column_names") == [column_name] and idx.get("name"):
            unique_index_names.add(idx["name"])
    for uc in insp.get_unique_constraints(table_name):
        if uc.get("column_names") == [column_name] and uc.get("name"):
            unique_index_names.add(uc["name"])

    if dialect == "sqlite":
        with target_engine.begin() as conn:
            _has_auto, named = _sqlite_unique_single_col_indexes(conn, table_name, column_name)
            unique_index_names.update(named)
            for idx_name in unique_index_names:
                if not idx_name.startswith("sqlite_autoindex_"):
                    safe_idx = idx_name.replace('"', "")
                    conn.execute(text(f'DROP INDEX IF EXISTS "{safe_idx}"'))

    if dialect == "postgresql":
        with target_engine.begin() as conn:
            for idx_name in unique_index_names:
                safe_name = idx_name.replace('"', "")
                conn.execute(text(f'ALTER TABLE "{table_name}" DROP CONSTRAINT IF EXISTS "{safe_name}"'))
                conn.execute(text(f'DROP INDEX IF EXISTS "{safe_name}"'))


def _ensure_index(target_engine, insp, table_name: str, index_name: str, columns: list[str], unique: bool = False) -> None:
    existing = insp.get_indexes(table_name)
    for idx in existing:
        if idx.get("column_names") == columns and bool(idx.get("unique")) == unique:
            return
        if idx.get("name") == index_name:
            return
    dialect = target_engine.dialect.name
    col_sql = ", ".join(f"`{c}`" if dialect == "mysql" else f'"{c}"' for c in columns)
    unique_kw = "UNIQUE " if unique else ""
    if dialect == "mysql":
        with target_engine.begin() as conn:
            conn.execute(text(f"CREATE {unique_kw}INDEX `{index_name}` ON `{table_name}` ({col_sql})"))
    else:
        with target_engine.begin() as conn:
            conn.execute(text(f'CREATE {unique_kw}INDEX IF NOT EXISTS "{index_name}" ON "{table_name}" ({col_sql})'))


def _ensure_username_column(target_engine) -> None:
    """Apply safe, idempotent schema migrations for multi-admin isolation and username auth."""
    dialect = target_engine.dialect.name
    insp = inspect(target_engine)
    table_names = set(insp.get_table_names())
    if "users" not in table_names:
        return

    user_cols = {c["name"] for c in insp.get_columns("users")}
    if "username" not in user_cols:
        with target_engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL"))

    if dialect == "mysql":
        email_col = next((c for c in insp.get_columns("users") if c["name"] == "email"), None)
        if email_col and not email_col.get("nullable", True):
            with target_engine.begin() as conn:
                conn.execute(text("ALTER TABLE `users` MODIFY COLUMN `email` VARCHAR(191) NULL"))

    for tbl in ("users", "courts", "tournaments", "games", "platform_settings"):
        if tbl in table_names:
            tbl_cols = {c["name"] for c in insp.get_columns(tbl)}
            if "admin_id" not in tbl_cols:
                with target_engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN admin_id INT NULL"))

    with target_engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE LOWER(role) = 'staff'"))
        rows = conn.execute(text("SELECT id, username, email FROM users ORDER BY id ASC")).fetchall()
        seen_usernames: set[str] = set()
        for row_id, uname, email in rows:
            candidate = (
                str(uname).strip().lower()
                if uname and str(uname).strip()
                else (
                    str(email).split("@")[0].strip().lower()
                    if email and "@" in str(email)
                    else f"user_{row_id}"
                )
            )
            final_uname = candidate if candidate not in seen_usernames else f"{candidate}_{row_id}"
            seen_usernames.add(final_uname)
            if not uname or str(uname).strip().lower() != final_uname:
                conn.execute(
                    text("UPDATE users SET username = :u WHERE id = :id"),
                    {"u": final_uname, "id": row_id},
                )

    # Refresh inspector after column additions
    insp = inspect(target_engine)

    # Handle SQLite inline UNIQUE constraints (autoindexes) on legacy tables if present
    if dialect == "sqlite":
        if "courts" in table_names:
            with target_engine.begin() as conn:
                has_auto_court, _ = _sqlite_unique_single_col_indexes(
                    conn, "courts", "court_number"
                )
            if has_auto_court:
                _sqlite_rebuild_table_without_unique(
                    target_engine,
                    "courts",
                    (
                        'CREATE TABLE "{table_name}" ('
                        'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, '
                        'admin_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE, '
                        'court_number INTEGER NOT NULL, '
                        'name VARCHAR(120) NOT NULL, '
                        'surface_type VARCHAR(32) NOT NULL, '
                        'status VARCHAR(32) NOT NULL, '
                        'is_enabled BOOLEAN NOT NULL, '
                        'maintenance_note TEXT, '
                        'maintenance_date VARCHAR(20), '
                        'maintenance_start VARCHAR(10), '
                        'maintenance_end VARCHAR(10), '
                        'created_at DATETIME NOT NULL, '
                        'updated_at DATETIME NOT NULL)'
                    ),
                )
        if "users" in table_names:
            with target_engine.begin() as conn:
                has_auto_email, _ = _sqlite_unique_single_col_indexes(
                    conn, "users", "email"
                )
            if has_auto_email:
                _sqlite_rebuild_table_without_unique(
                    target_engine,
                    "users",
                    (
                        'CREATE TABLE "{table_name}" ('
                        'id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, '
                        'admin_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE, '
                        'username VARCHAR(64), '
                        'email VARCHAR(191), '
                        'full_name VARCHAR(120) NOT NULL, '
                        'job_title VARCHAR(120), '
                        'phone VARCHAR(40), '
                        'hashed_password VARCHAR(255) NOT NULL, '
                        'role VARCHAR(32) NOT NULL, '
                        'is_active BOOLEAN NOT NULL, '
                        'created_at DATETIME NOT NULL, '
                        'updated_at DATETIME NOT NULL)'
                    ),
                )
        insp = inspect(target_engine)

    # Drop legacy global UNIQUE indexes on court_number, game code, tournament code, and user email
    if "users" in table_names:
        _drop_single_col_unique_indexes(target_engine, insp, "users", "email")
    if "courts" in table_names:
        _drop_single_col_unique_indexes(target_engine, insp, "courts", "court_number")
    if "games" in table_names:
        _drop_single_col_unique_indexes(target_engine, insp, "games", "code")
    if "tournaments" in table_names:
        _drop_single_col_unique_indexes(target_engine, insp, "tournaments", "code")

    insp = inspect(target_engine)

    # Ensure required non-unique and unique indexes
    if "users" in table_names:
        _ensure_index(target_engine, insp, "users", "ix_users_email", ["email"], unique=False)
        _ensure_index(target_engine, insp, "users", "ix_users_admin_id", ["admin_id"], unique=False)
        _ensure_index(
            target_engine,
            insp,
            "users",
            "ix_users_admin_role_active",
            ["admin_id", "role", "is_active"],
            unique=False,
        )
        try:
            _ensure_index(target_engine, insp, "users", "ix_users_username", ["username"], unique=True)
        except Exception:
            _ensure_index(target_engine, insp, "users", "ix_users_username_nonuniq", ["username"], unique=False)

    if "courts" in table_names:
        _ensure_index(target_engine, insp, "courts", "ix_courts_admin_id", ["admin_id"], unique=False)
        _ensure_index(target_engine, insp, "courts", "ix_courts_court_number", ["court_number"], unique=False)
        _ensure_index(
            target_engine,
            insp,
            "courts",
            "ix_courts_admin_status",
            ["admin_id", "status"],
            unique=False,
        )

    if "games" in table_names:
        _ensure_index(target_engine, insp, "games", "ix_games_admin_id", ["admin_id"], unique=False)
        _ensure_index(target_engine, insp, "games", "ix_games_code", ["code"], unique=False)
        _ensure_index(
            target_engine,
            insp,
            "games",
            "ix_games_admin_status_date",
            ["admin_id", "status", "scheduled_date"],
            unique=False,
        )
        _ensure_index(
            target_engine,
            insp,
            "games",
            "ix_games_admin_court_date_status",
            ["admin_id", "court_id", "scheduled_date", "status"],
            unique=False,
        )

    if "tournaments" in table_names:
        _ensure_index(target_engine, insp, "tournaments", "ix_tournaments_admin_id", ["admin_id"], unique=False)
        _ensure_index(target_engine, insp, "tournaments", "ix_tournaments_code", ["code"], unique=False)
        _ensure_index(
            target_engine,
            insp,
            "tournaments",
            "ix_tournaments_admin_start_date",
            ["admin_id", "start_date"],
            unique=False,
        )

    if "platform_settings" in table_names:
        _ensure_index(target_engine, insp, "platform_settings", "ix_platform_settings_admin_id", ["admin_id"], unique=False)


def initialize_runtime_database() -> str:
    """Ensure database schema and seed data exist; supports DATABASE_URL (cloud MySQL) or local fallback in dev."""
    global engine, SessionLocal, active_db_backend

    from app.db.base import Base
    from app.db.seed import seed_database

    is_prod = settings.APP_ENV.strip().lower() == "production"
    uri = settings.sqlalchemy_database_uri

    if uri.startswith("postgresql"):
        try:
            Base.metadata.create_all(bind=engine)
            _ensure_username_column(engine)
            with SessionLocal() as db:
                seed_database(db)
            active_db_backend = "supabase postgres (connected)"
            return active_db_backend
        except Exception as exc:
            if is_prod:
                raise
            sqlite_url = "sqlite:///./rallyos_local.db"
            engine = create_engine(
                sqlite_url,
                connect_args={"check_same_thread": False},
            )
            _attach_sqlite_pragmas(engine)
            SessionLocal.configure(bind=engine)
            Base.metadata.create_all(bind=engine)
            _ensure_username_column(engine)
            with SessionLocal() as db:
                seed_database(db)
            active_db_backend = f"sqlite-fallback (postgres offline: {exc})"
            return active_db_backend

    if uri.startswith("mysql"):
        try:
            if not settings.DATABASE_URL:
                conn_kwargs: dict[str, Any] = {
                    "host": settings.MYSQL_HOST,
                    "port": settings.MYSQL_PORT,
                    "user": settings.MYSQL_USER,
                    "password": settings.MYSQL_PASSWORD,
                    "charset": "utf8mb4",
                    "connect_timeout": 3,
                }
                if settings.DB_SSL_CA:
                    conn_kwargs["ssl"] = {"ca": settings.DB_SSL_CA}
                conn = pymysql.connect(**conn_kwargs)
                with conn.cursor() as cur:
                    db_name = settings.MYSQL_DATABASE.replace("`", "")
                    cur.execute(
                        f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
                        "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
                    )
                conn.commit()
                conn.close()

            Base.metadata.create_all(bind=engine)
            _ensure_username_column(engine)
            with SessionLocal() as db:
                seed_database(db)
            active_db_backend = "mysql (connected)"
            return active_db_backend
        except Exception:
            if is_prod:
                raise
            sqlite_url = "sqlite:///./rallyos_local.db"
            engine = create_engine(
                sqlite_url,
                connect_args={"check_same_thread": False},
            )
            _attach_sqlite_pragmas(engine)
            SessionLocal.configure(bind=engine)
            Base.metadata.create_all(bind=engine)
            _ensure_username_column(engine)
            with SessionLocal() as db:
                seed_database(db)
            active_db_backend = "sqlite-fallback (mysql offline)"
            return active_db_backend

    Base.metadata.create_all(bind=engine)
    _ensure_username_column(engine)
    with SessionLocal() as db:
        seed_database(db)
    active_db_backend = "connected"
    return active_db_backend


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> bool:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
