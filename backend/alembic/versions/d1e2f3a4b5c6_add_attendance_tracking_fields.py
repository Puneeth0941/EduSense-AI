"""add attendance tracking fields

Revision ID: d1e2f3a4b5c6
Revises: a1b2c3d4e5f6
Create Date: 2026-09-07 18:35:00.000000

"""
from alembic import op
import sqlalchemy as sqla
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'd1e2f3a4b5c6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('attendance_records', 'status', type_=sqla.String(50))
    op.add_column('attendance_records', sqla.Column('first_verified_at', sqla.DateTime(timezone=True), nullable=True))
    op.add_column('attendance_records', sqla.Column('last_verified_at', sqla.DateTime(timezone=True), nullable=True))
    op.add_column('attendance_records', sqla.Column('verification_count', sqla.Integer(), server_default='0', nullable=False))
    op.add_column('attendance_records', sqla.Column('presence_duration_seconds', sqla.Integer(), server_default='0', nullable=False))
    op.add_column('attendance_records', sqla.Column('is_manually_corrected', sqla.Boolean(), server_default='false', nullable=False))
    op.add_column('attendance_records', sqla.Column('corrected_by_id', postgresql.UUID(as_uuid=True), sqla.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    op.add_column('attendance_records', sqla.Column('correction_reason', sqla.Text(), nullable=True))


def downgrade():
    op.drop_column('attendance_records', 'correction_reason')
    op.drop_column('attendance_records', 'corrected_by_id')
    op.drop_column('attendance_records', 'is_manually_corrected')
    op.drop_column('attendance_records', 'presence_duration_seconds')
    op.drop_column('attendance_records', 'verification_count')
    op.drop_column('attendance_records', 'last_verified_at')
    op.drop_column('attendance_records', 'first_verified_at')
