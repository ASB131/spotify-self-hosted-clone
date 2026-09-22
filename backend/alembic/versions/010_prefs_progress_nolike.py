"""Default download quality + download byte progress; remove Liked Songs playlists."""

from alembic import op
import sqlalchemy as sa

revision = "010_prefs_progress_nolike"
down_revision = "009_liked_hearts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("default_audio_format", sa.String(length=8), nullable=False, server_default="mp3"),
    )
    op.add_column("download_jobs", sa.Column("bytes_downloaded", sa.BigInteger(), nullable=True))
    op.add_column("download_jobs", sa.Column("bytes_total", sa.BigInteger(), nullable=True))
    op.add_column("download_jobs", sa.Column("speed_bps", sa.BigInteger(), nullable=True))

    # Remove Liked Songs system playlists (hearts feature retired)
    op.execute("DELETE FROM playlists WHERE is_liked_playlist IS TRUE")


def downgrade() -> None:
    op.drop_column("download_jobs", "speed_bps")
    op.drop_column("download_jobs", "bytes_total")
    op.drop_column("download_jobs", "bytes_downloaded")
    op.drop_column("users", "default_audio_format")
