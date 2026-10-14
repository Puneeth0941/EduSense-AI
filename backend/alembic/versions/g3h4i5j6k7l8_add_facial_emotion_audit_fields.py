"""Add emotion_backend, raw_dominant, confidence, and prediction_status to facial_analyses

Revision ID: g3h4i5j6k7l8
Revises: f2g3h4i5j6k7
Create Date: 2026-10-13 14:15:00.000000

"""
from alembic import op
import sqlalchemy as sqla

# revision identifiers, used by Alembic.
revision = 'g3h4i5j6k7l8'
down_revision = 'f2g3h4i5j6k7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('facial_analyses', sqla.Column('emotion_backend', sqla.String(length=30), nullable=True))
    op.add_column('facial_analyses', sqla.Column('raw_dominant', sqla.String(length=50), nullable=True))
    op.add_column('facial_analyses', sqla.Column('confidence', sqla.Float(), nullable=True))
    op.add_column('facial_analyses', sqla.Column('prediction_status', sqla.String(length=30), nullable=True))


def downgrade():
    op.drop_column('facial_analyses', 'prediction_status')
    op.drop_column('facial_analyses', 'confidence')
    op.drop_column('facial_analyses', 'raw_dominant')
    op.drop_column('facial_analyses', 'emotion_backend')
