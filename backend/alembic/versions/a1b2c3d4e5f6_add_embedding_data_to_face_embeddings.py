"""Add embedding_data and updated_at to face_embeddings

Revision ID: a1b2c3d4e5f6
Revises: c5792a705f1f
Create Date: 2026-09-07 11:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c5792a705f1f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('face_embeddings', sa.Column('embedding_data', sa.JSON(), nullable=True))
    op.add_column('face_embeddings', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))


def downgrade() -> None:
    op.drop_column('face_embeddings', 'updated_at')
    op.drop_column('face_embeddings', 'embedding_data')
