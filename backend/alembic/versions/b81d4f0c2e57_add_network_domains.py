"""add network domains

One row per device per website name seen in the Windows DNS cache
(agent 1.4.0+), with category and risk.

Revision ID: b81d4f0c2e57
Revises: a7c2e91b4d10
Create Date: 2026-11-16 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b81d4f0c2e57"
down_revision: Union[str, Sequence[str], None] = "a7c2e91b4d10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "network_domains",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organization_id", sa.Integer(), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("apps", sa.JSON(), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=False, server_default="other"),
        sa.Column("risk", sa.String(length=12), nullable=False, server_default="ok"),
        sa.Column("reason", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["device_id"], ["agents.device_id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_id", "domain", name="uq_network_domains_device_domain"),
    )
    op.create_index(op.f("ix_network_domains_id"), "network_domains", ["id"], unique=False)
    op.create_index(op.f("ix_network_domains_organization_id"), "network_domains", ["organization_id"], unique=False)
    op.create_index(op.f("ix_network_domains_device_id"), "network_domains", ["device_id"], unique=False)
    op.create_index(op.f("ix_network_domains_last_seen"), "network_domains", ["last_seen"], unique=False)
    op.create_index(op.f("ix_network_domains_risk"), "network_domains", ["risk"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_network_domains_risk"), table_name="network_domains")
    op.drop_index(op.f("ix_network_domains_last_seen"), table_name="network_domains")
    op.drop_index(op.f("ix_network_domains_device_id"), table_name="network_domains")
    op.drop_index(op.f("ix_network_domains_organization_id"), table_name="network_domains")
    op.drop_index(op.f("ix_network_domains_id"), table_name="network_domains")
    op.drop_table("network_domains")
