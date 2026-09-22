"""Add discovery playlists, play history, artist MBID cache; extend download_jobs."""

from alembic import op
import sqlalchemy as sa

revision = "006_discovery"
down_revision = "005_rename_liked_to_all_songs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artist_mbids",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("normalized_name", sa.String(length=512), nullable=False),
        sa.Column("display_name", sa.String(length=512), nullable=False),
        sa.Column("mbid", sa.String(length=36), nullable=True),
        sa.Column("tags_json", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_name", name="uq_artist_mbid_name"),
    )
    op.create_index("ix_artist_mbids_normalized_name", "artist_mbids", ["normalized_name"])
    op.create_index("ix_artist_mbids_mbid", "artist_mbids", ["mbid"])

    op.create_table(
        "play_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("track_id", sa.Integer(), nullable=False),
        sa.Column("playlist_id", sa.Integer(), nullable=True),
        sa.Column("played_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["playlist_id"], ["playlists.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_play_events_user_id", "play_events", ["user_id"])
    op.create_index("ix_play_events_track_id", "play_events", ["track_id"])
    op.create_index("ix_play_events_user_played", "play_events", ["user_id", "played_at"])

    op.create_table(
        "discovery_playlists",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("week_key", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "kind", name="uq_discovery_user_kind"),
    )
    op.create_index("ix_discovery_playlists_user_id", "discovery_playlists", ["user_id"])

    op.create_table(
        "discovery_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("playlist_id", sa.Integer(), nullable=False),
        sa.Column("week_key", sa.String(length=16), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("artist", sa.String(length=512), nullable=False),
        sa.Column("album", sa.String(length=512), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("recording_mbid", sa.String(length=36), nullable=True),
        sa.Column("release_mbid", sa.String(length=36), nullable=True),
        sa.Column("artist_mbid", sa.String(length=36), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
        sa.Column("track_id", sa.Integer(), nullable=True),
        sa.Column("acquire_via", sa.String(length=32), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["playlist_id"], ["discovery_playlists.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_discovery_items_playlist_id", "discovery_items", ["playlist_id"])
    op.create_index("ix_discovery_items_week_key", "discovery_items", ["week_key"])
    op.create_index("ix_discovery_items_playlist_week", "discovery_items", ["playlist_id", "week_key"])

    op.add_column("download_jobs", sa.Column("discovery_item_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_download_jobs_discovery_item",
        "download_jobs",
        "discovery_items",
        ["discovery_item_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_download_jobs_discovery_item", "download_jobs", type_="foreignkey")
    op.drop_column("download_jobs", "discovery_item_id")
    op.drop_table("discovery_items")
    op.drop_table("discovery_playlists")
    op.drop_table("play_events")
    op.drop_table("artist_mbids")
