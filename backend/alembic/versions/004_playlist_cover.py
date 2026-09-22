"""Add playlist cover image path."""

from alembic import op
import sqlalchemy as sa

revision = "004_playlist_cover"
down_revision = "003_download_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("playlists", sa.Column("cover_relative_path", sa.String(length=1024), nullable=True))


def downgrade() -> None:
    op.drop_column("playlists", "cover_relative_path")
