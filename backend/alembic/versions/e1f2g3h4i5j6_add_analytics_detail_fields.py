"""Add analytics detail fields for facial, sentiment, engagement, and report tracking

Revision ID: e1f2g3h4i5j6
Revises: d1e2f3a4b5c6
Create Date: 2026-10-07 07:35:00.000000

"""
from alembic import op
import sqlalchemy as sqla

# revision identifiers, used by Alembic.
revision = 'e1f2g3h4i5j6'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    # Add optional detail columns to existing analytics tables
    op.add_column('facial_analyses', sqla.Column('attentiveness_score', sqla.Float(), nullable=True))
    op.add_column('facial_analyses', sqla.Column('head_pose', sqla.String(length=50), nullable=True))

    op.add_column('speech_analyses', sqla.Column('transcript_text', sqla.Text(), nullable=True))

    op.add_column('sentiment_analyses', sqla.Column('text_content', sqla.Text(), nullable=True))
    op.add_column('sentiment_analyses', sqla.Column('sentiment_label', sqla.String(length=20), nullable=True))

    op.add_column('distraction_events', sqla.Column('duration_seconds', sqla.Float(), server_default='0.0', nullable=True))

    op.add_column('engagement_metrics', sqla.Column('attentiveness_subscore', sqla.Float(), nullable=True))
    op.add_column('engagement_metrics', sqla.Column('participation_subscore', sqla.Float(), nullable=True))
    op.add_column('engagement_metrics', sqla.Column('sentiment_subscore', sqla.Float(), nullable=True))

    op.add_column('class_reports', sqla.Column('average_engagement', sqla.Float(), nullable=True))
    op.add_column('class_reports', sqla.Column('total_distractions', sqla.Integer(), server_default='0', nullable=True))


def downgrade():
    op.drop_column('class_reports', 'total_distractions')
    op.drop_column('class_reports', 'average_engagement')

    op.drop_column('engagement_metrics', 'sentiment_subscore')
    op.drop_column('engagement_metrics', 'participation_subscore')
    op.drop_column('engagement_metrics', 'attentiveness_subscore')

    op.drop_column('distraction_events', 'duration_seconds')

    op.drop_column('sentiment_analyses', 'sentiment_label')
    op.drop_column('sentiment_analyses', 'text_content')

    op.drop_column('speech_analyses', 'transcript_text')

    op.drop_column('facial_analyses', 'head_pose')
    op.drop_column('facial_analyses', 'attentiveness_score')
