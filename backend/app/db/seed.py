from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.api.v1.endpoints.settings_ep import DEFAULT_SETTINGS
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models.court import Court
from app.models.enums import UserRole
from app.models.game import Game
from app.models.settings_model import PlatformSettings
from app.models.tournament import Tournament
from app.models.user import User

DEFAULT_SUPER_ADMIN = (
    "superadmin",
    "superadmin@rallyos.club",
    "Super Admin",
    "Platform Super Admin",
)

DEFAULT_ADMINS = [
    ("admin", "admin@rallyos.club", "Administrator", "System Administrator"),
    ("admin1", "admin1@rallyos.club", "Administrator 1", "Club Administrator"),
    ("admin2", "admin2@rallyos.club", "Administrator 2", "Club Administrator"),
]


def seed_database(db: Session) -> None:
    """Ensure default Super Admin, Administrator accounts, and per-admin platform settings exist."""
    sa_uname, sa_email, sa_full_name, sa_job_title = DEFAULT_SUPER_ADMIN
    super_admin = db.scalar(
        select(User).where(
            (User.username == sa_uname) | (User.email == sa_email)
        )
    )
    if not super_admin:
        super_admin = User(
            admin_id=None,
            username=sa_uname,
            email=sa_email,
            full_name=sa_full_name,
            job_title=sa_job_title,
            phone=None,
            hashed_password=hash_password("SuperAdmin123!"),
            role=UserRole.SUPER_ADMIN.value,
            is_active=True,
        )
        db.add(super_admin)
        db.flush()
    else:
        super_admin.admin_id = None
        super_admin.username = sa_uname
        super_admin.role = UserRole.SUPER_ADMIN.value
        super_admin.is_active = True
        db.add(super_admin)
        db.flush()

    admin_users: list[User] = []
    default_pw_hash: str | None = None

    for uname, email, full_name, job_title in DEFAULT_ADMINS:
        admin_user = db.scalar(
            select(User).where(
                (User.username == uname) | (User.email == email)
            )
        )
        if not admin_user:
            if default_pw_hash is None:
                default_pw_hash = hash_password("Admin123!")
            admin_user = User(
                admin_id=None,
                username=uname,
                email=email,
                full_name=full_name,
                job_title=job_title,
                phone=None,
                hashed_password=default_pw_hash,
                role=UserRole.ADMIN.value,
                is_active=True,
            )
            db.add(admin_user)
            db.flush()
        else:
            admin_user.admin_id = None
            admin_user.username = uname
            admin_user.role = UserRole.ADMIN.value
            admin_user.is_active = True
            db.add(admin_user)
            db.flush()
        admin_users.append(admin_user)

    primary_admin_id = admin_users[0].id

    # Remove deprecated staff role accounts
    db.execute(delete(User).where(func.lower(User.role) == "staff"))

    # Assign any legacy unowned scorekeeper accounts or records to the primary admin
    db.execute(
        update(User)
        .where(
            User.role == UserRole.SCOREKEEPER.value, User.admin_id.is_(None)
        )
        .values(admin_id=primary_admin_id)
    )
    db.execute(
        update(Court)
        .where(Court.admin_id.is_(None))
        .values(admin_id=primary_admin_id)
    )
    db.execute(
        update(Game)
        .where(Game.admin_id.is_(None))
        .values(admin_id=primary_admin_id)
    )
    db.execute(
        update(Tournament)
        .where(Tournament.admin_id.is_(None))
        .values(admin_id=primary_admin_id)
    )

    for adm in admin_users:
        has_settings = db.scalar(
            select(PlatformSettings.id)
            .where(PlatformSettings.admin_id == adm.id)
            .limit(1)
        )
        if not has_settings:
            db.add(PlatformSettings(admin_id=adm.id, **DEFAULT_SETTINGS))

    db.commit()


def main() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    print("RallyOS Administrator accounts initialized successfully.")


if __name__ == "__main__":
    main()
