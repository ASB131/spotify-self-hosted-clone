"""Alembic migration: server_config for Admin-managed integrations."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002_server_config"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "server_config",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("spotify_client_id", sa.String(length=256), nullable=False),
        sa.Column("spotify_client_secret_enc", sa.Text(), nullable=True),
        sa.Column("spotify_redirect_uri", sa.String(length=512), nullable=False),
        sa.Column("public_web_url", sa.String(length=512), nullable=False),
        sa.Column("lidarr_base_url", sa.String(length=512), nullable=True),
        sa.Column("lidarr_api_key_enc", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        """
        INSERT INTO server_config (id, spotify_client_id, spotify_redirect_uri, public_web_url)
        VALUES (1, '', 'http://localhost:8000/api/v1/spotify/callback', 'http://localhost:3000')
        """
    )


def downgrade() -> None:
    op.drop_table("server_config")
