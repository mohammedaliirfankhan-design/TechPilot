
"""Create the original TechAIPILOT database schema.

Revision ID: 19e9acc2f424
Revises:
Create Date: 2026-09-03 16:17:35.062073
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# Alembic revision identifiers.
revision: str = "19e9acc2f424"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the original five core tables."""

    # 1. Users
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )

    op.create_index("ix_users_id", "users", ["id"], unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 2. Agents
    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("agent_token_hash", sa.String(length=255), nullable=True),
        sa.Column(
            "agent_token_created_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column(
            "operating_system",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column("os_version", sa.String(length=100), nullable=False),
        sa.Column("agent_version", sa.String(length=50), nullable=False),
        sa.Column(
            "registered_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "last_seen",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="agents_user_id_fkey",
        ),
    )

    op.create_index("ix_agents_id", "agents", ["id"], unique=False)
    op.create_index(
        "ix_agents_device_id",
        "agents",
        ["device_id"],
        unique=True,
    )

    # 3. Alerts
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("alert_type", sa.String(length=100), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
    )

    op.create_index("ix_alerts_id", "alerts", ["id"], unique=False)
    op.create_index(
        "ix_alerts_device_id",
        "alerts",
        ["device_id"],
        unique=False,
    )

    # 4. Telemetry
    op.create_table(
        "telemetry",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column("cpu_percent", sa.Float(), nullable=False),
        sa.Column("memory_percent", sa.Float(), nullable=False),
        sa.Column("disk_percent", sa.Float(), nullable=False),
        sa.Column(
            "collected_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["agents.device_id"],
            name="telemetry_device_id_fkey",
        ),
    )

    op.create_index("ix_telemetry_id", "telemetry", ["id"], unique=False)
    op.create_index(
        "ix_telemetry_device_id",
        "telemetry",
        ["device_id"],
        unique=False,
    )

    # 5. Remote sessions
    op.create_table(
        "remote_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "ended_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_remote_sessions_id",
        "remote_sessions",
        ["id"],
        unique=False,
    )
    op.create_index(
        "ix_remote_sessions_device_id",
        "remote_sessions",
        ["device_id"],
        unique=False,
    )


def downgrade() -> None:
    """Remove the original core schema."""

    op.drop_table("remote_sessions")
    op.drop_table("telemetry")
    op.drop_table("alerts")
    op.drop_table("agents")
    op.drop_table("users")
