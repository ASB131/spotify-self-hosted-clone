"""Alembic: download_jobs table for progress tracking."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003_download_jobs"
down_revision: Union[str, None] = "002_server_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "download_jobs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("celery_task_id", sa.String(length=64), nullable=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=True),
        sa.Column("artist", sa.String(length=512), nullable=True),
        sa.Column("audio_format", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("stage", sa.String(length=128), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("track_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["track_id"], ["tracks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_download_jobs_user_id", "download_jobs", ["user_id"])
    op.create_index("ix_download_jobs_celery_task_id", "download_jobs", ["celery_task_id"])


def downgrade() -> None:
    op.drop_index("ix_download_jobs_celery_task_id", table_name="download_jobs")
    op.drop_index("ix_download_jobs_user_id", table_name="download_jobs")
    op.drop_table("download_jobs")
