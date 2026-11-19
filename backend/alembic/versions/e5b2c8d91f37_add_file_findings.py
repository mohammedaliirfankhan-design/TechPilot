"""add file findings

Creates the file_findings table: things an admin should look at, found by
rules over downloads and USB activity (agent 1.5.0+).

Revision ID: e5b2c8d91f37
Revises: c4f1d8a29b63
Create Date: 2026-11-19 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e5b2c8d91f37"
down_revision: Union[str, Sequence[str], None] = "c4f1d8a29b63"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "file_findings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("rule", sa.String(length=40), nullable=False),
        sa.Column("severity", sa.String(length=10), server_default="warn", nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("detail", sa.String(length=1000), nullable=True),
        sa.Column("subject", sa.String(length=300), nullable=True),
        sa.Column("fingerprint", sa.String(length=200), nullable=False),
        sa.Column("occurrences", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notify_attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("notify_error", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["agents.device_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_id", "fingerprint", name="uq_file_findings_device_fingerprint"),
    )

    op.create_index("ix_file_findings_org_seen", "file_findings", ["organization_id", "last_seen_at"])
    op.create_index("ix_file_findings_device_seen", "file_findings", ["device_id", "last_seen_at"])
    op.create_index("ix_file_findings_pending", "file_findings", ["notified_at", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_file_findings_pending", table_name="file_findings")
    op.drop_index("ix_file_findings_device_seen", table_name="file_findings")
    op.drop_index("ix_file_findings_org_seen", table_name="file_findings")
    op.drop_table("file_findings")
