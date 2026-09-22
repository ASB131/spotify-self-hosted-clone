"""User-managed ampersand artist keep list."""

from alembic import op
import sqlalchemy as sa

revision = "008_artist_keeps"
down_revision = "007_provenance_art"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artist_keeps",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("normalized_name", sa.String(length=512), nullable=False),
        sa.Column("display_name", sa.String(length=512), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "normalized_name", name="uq_artist_keep_user_name"),
    )
    op.create_index("ix_artist_keeps_user_id", "artist_keeps", ["user_id"])
    op.create_index("ix_artist_keeps_normalized_name", "artist_keeps", ["normalized_name"])


def downgrade() -> None:
    op.drop_index("ix_artist_keeps_normalized_name", table_name="artist_keeps")
    op.drop_index("ix_artist_keeps_user_id", table_name="artist_keeps")
    op.drop_table("artist_keeps")
