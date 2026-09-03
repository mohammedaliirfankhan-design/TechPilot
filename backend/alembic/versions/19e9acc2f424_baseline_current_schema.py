"""baseline current schema

Revision ID: 19e9acc2f424
Revises:
Create Date: 2026-09-03 16:17:35.062073

"""

from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "19e9acc2f424"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Establish the existing database schema as the baseline."""
    pass


def downgrade() -> None:
    """Baseline has no schema changes to reverse."""
    pass