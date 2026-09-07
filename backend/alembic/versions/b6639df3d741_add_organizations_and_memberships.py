"""add organizations and memberships

Revision ID: b6639df3d741
Revises: 19e9acc2f424
Create Date: 2026-09-03 16:38:48.623948

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b6639df3d741"
down_revision: Union[str, Sequence[str], None] = "19e9acc2f424"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create organizations and memberships and migrate existing ownership."""

    op.create_table(
        "organizations",
        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "name",
            sa.String(length=255),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="ACTIVE",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    op.create_table(
        "organization_users",
        sa.Column(
            "id",
            sa.Integer(),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "organization_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.String(length=30),
            nullable=False,
            server_default="TECHNICIAN",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.UniqueConstraint(
            "organization_id",
            "user_id",
            name="uq_organization_users_organization_user",
        ),
    )

    op.add_column(
        "agents",
        sa.Column(
            "organization_id",
            sa.Integer(),
            nullable=True,
        ),
    )

    op.create_index(
        "ix_agents_organization_id",
        "agents",
        ["organization_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_agents_organization_id",
        "agents",
        "organizations",
        ["organization_id"],
        ["id"],
    )

    # Create one organization for every existing user.
    op.execute(
        sa.text(
            """
            INSERT INTO organizations (name, status)
            SELECT
                'TechAIPILOT - ' || email,
                'ACTIVE'
            FROM users
            """
        )
    )

    # Give every existing user ownership of their organization.
    op.execute(
        sa.text(
            """
            INSERT INTO organization_users (
                organization_id,
                user_id,
                role
            )
            SELECT
                o.id,
                u.id,
                'OWNER'
            FROM users u
            JOIN organizations o
                ON o.name = 'TechAIPILOT - ' || u.email
            """
        )
    )

    # Preserve existing agent ownership by mapping user_id
    # to that user's newly created organization.
    op.execute(
        sa.text(
            """
            UPDATE agents a
            SET organization_id = o.id
            FROM organizations o
            WHERE a.user_id IS NOT NULL
              AND o.name = (
                  SELECT 'TechAIPILOT - ' || u.email
                  FROM users u
                  WHERE u.id = a.user_id
              )
            """
        )
    )


def downgrade() -> None:
    """Remove organization ownership structures."""

    op.drop_constraint(
        "fk_agents_organization_id",
        "agents",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_agents_organization_id",
        table_name="agents",
    )

    op.drop_column(
        "agents",
        "organization_id",
    )

    op.drop_table("organization_users")
    op.drop_table("organizations")