"""add file events

Creates the file_events table that stores download and USB activity
reported by agent 1.5.0+ (metadata only).

Revision ID: c4f1d8a29b63
Revises: b81d4f0c2e57
Create Date: 2026-11-18 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4f1d8a29b63"
down_revision: Union[str, Sequence[str], None] = "b81d4f0c2e57"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "file_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("dedupe_key", sa.String(length=64), nullable=False),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("file_name", sa.String(length=512), nullable=True),
        sa.Column("file_path", sa.String(length=1024), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("source_domain", sa.String(length=255), nullable=True),
        sa.Column("referrer_url", sa.String(length=2048), nullable=True),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("browser", sa.String(length=32), nullable=True),
        sa.Column("browser_profile", sa.String(length=128), nullable=True),
        sa.Column("download_state", sa.String(length=32), nullable=True),
        sa.Column("danger_type", sa.Integer(), nullable=True),
        sa.Column(
            "browser_flagged",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("zone_id", sa.Integer(), nullable=True),
        sa.Column("drive_letter", sa.String(length=8), nullable=True),
        sa.Column("volume_label", sa.String(length=128), nullable=True),
        sa.Column("volume_serial", sa.String(length=16), nullable=True),
        sa.Column("fs_type", sa.String(length=16), nullable=True),
        sa.ForeignKeyConstraint(
            ["device_id"], ["agents.device_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"], ["organizations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "device_id", "dedupe_key", name="uq_file_events_device_dedupe"
        ),
    )

    op.create_index(
        "ix_file_events_org_occurred",
        "file_events",
        ["organization_id", "occurred_at"],
    )
    op.create_index(
        "ix_file_events_device_occurred",
        "file_events",
        ["device_id", "occurred_at"],
    )
    op.create_index(
        op.f("ix_file_events_event_type"), "file_events", ["event_type"]
    )
    op.create_index(op.f("ix_file_events_sha256"), "file_events", ["sha256"])
    op.create_index(
        op.f("ix_file_events_source_domain"), "file_events", ["source_domain"]
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_file_events_source_domain"), table_name="file_events")
    op.drop_index(op.f("ix_file_events_sha256"), table_name="file_events")
    op.drop_index(op.f("ix_file_events_event_type"), table_name="file_events")
    op.drop_index("ix_file_events_device_occurred", table_name="file_events")
    op.drop_index("ix_file_events_org_occurred", table_name="file_events")
    op.drop_table("file_events")
