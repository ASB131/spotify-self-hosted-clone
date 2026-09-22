"""Add user_tracks.is_liked and playlists.is_liked_playlist; seed Liked Songs."""

from alembic import op
import sqlalchemy as sa

revision = "009_liked_hearts"
down_revision = "008_artist_keeps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_tracks",
        sa.Column("is_liked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "playlists",
        sa.Column("is_liked_playlist", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    # Create Liked Songs for every user that has All Songs but no Liked Songs yet
    op.execute(
        """
        INSERT INTO playlists (user_id, name, description, is_liked_songs, is_liked_playlist, created_at, updated_at)
        SELECT u.id,
               'Liked Songs',
               'Songs you hearted',
               false,
               true,
               now(),
               now()
        FROM users u
        WHERE NOT EXISTS (
            SELECT 1 FROM playlists p
            WHERE p.user_id = u.id AND p.is_liked_playlist IS TRUE
        )
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM playlists WHERE is_liked_playlist IS TRUE")
    op.drop_column("playlists", "is_liked_playlist")
    op.drop_column("user_tracks", "is_liked")
