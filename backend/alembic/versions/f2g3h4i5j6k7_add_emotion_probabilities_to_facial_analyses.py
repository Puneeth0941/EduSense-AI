"""Add emotion_probabilities column to facial_analyses table

Revision ID: f2g3h4i5j6k7
Revises: e1f2g3h4i5j6
Create Date: 2026-10-07 21:30:00.000000

"""
from alembic import op
import sqlalchemy as sqla
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'f2g3h4i5j6k7'
down_revision = 'e1f2g3h4i5j6'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('facial_analyses', sqla.Column('emotion_probabilities', postgresql.JSON(astext_type=sqla.Text()), nullable=True))


def downgrade():
    op.drop_column('facial_analyses', 'emotion_probabilities')
