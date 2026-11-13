"""add agent display name

Revision ID: a7c3e91f2b40
Revises: d48836fe792d
Create Date: 2026-11-13 10:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a7c3e91f2b40"
down_revision: Union[str, Sequence[str], None] = "d48836fe792d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "agents",
        sa.Column("display_name", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("agents", "display_name")
