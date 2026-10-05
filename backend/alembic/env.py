from logging.config import fileConfig
from pathlib import Path
import sys

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

# Add the backend directory to Python's import path.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Load the existing backend environment configuration.
ENV_FILE = BACKEND_DIR / ".env"
load_dotenv(ENV_FILE)

from app.config import DATABASE_URL
from app.database import Base

# Import every model so SQLAlchemy metadata contains the full schema.
from app.models.user import User
from app.models.agent import Agent
from app.models.telemetry import Telemetry
from app.models.alert import Alert
from app.models.remote_session import RemoteSession
from app.models.organization import Organization
from app.models.organization_user import OrganizationUser
from app.models.network_snapshot import NetworkSnapshot
from app.models.network_interface import NetworkInterface
from app.models.network_connection import NetworkConnection
from app.models.network_listener import NetworkListener
from app.models.firewall_posture import FirewallPosture


config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Alembic compares this metadata against the existing database schema.
target_metadata = Base.metadata


def get_database_url() -> str:
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not configured."
        )

    return DATABASE_URL


def run_migrations_offline() -> None:
    """Run migrations without creating a database connection."""
    url = get_database_url()

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={
            "paramstyle": "named",
        },
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations using a live database connection."""
    configuration = config.get_section(
        config.config_ini_section,
        {},
    )

    configuration["sqlalchemy.url"] = get_database_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()