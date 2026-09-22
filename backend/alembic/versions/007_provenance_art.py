"""Add added_via on user_tracks and art_url on discovery_items."""

from alembic import op
import sqlalchemy as sa

revision = "007_provenance_art"
down_revision = "006_discovery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_tracks",
        sa.Column("added_via", sa.String(length=32), nullable=False, server_default="library"),
    )
    op.add_column("discovery_items", sa.Column("art_url", sa.String(length=1024), nullable=True))
    op.add_column("download_jobs", sa.Column("added_via", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("download_jobs", "added_via")
    op.drop_column("discovery_items", "art_url")
    op.drop_column("user_tracks", "added_via")
