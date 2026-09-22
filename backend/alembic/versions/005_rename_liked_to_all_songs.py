"""Rename Liked Songs playlists to All Songs."""

from alembic import op

revision = "005_rename_liked_to_all_songs"
down_revision = "004_playlist_cover"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE playlists
        SET name = 'All Songs',
            description = COALESCE(NULLIF(description, ''), 'Every track in your library')
        WHERE is_liked_songs IS TRUE
          AND name IN ('Liked Songs', 'liked songs')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE playlists
        SET name = 'Liked Songs',
            description = 'Your liked tracks'
        WHERE is_liked_songs IS TRUE
          AND name = 'All Songs'
        """
    )
