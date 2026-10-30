"""Add course enrollments and time-based attendance tracking tables and columns

Revision ID: h4i5j6k7l8m9
Revises: g3h4i5j6k7l8
Create Date: 2026-10-30 09:45:00.000000

"""
from alembic import op
import sqlalchemy as sqla
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = 'h4i5j6k7l8m9'
down_revision = 'g3h4i5j6k7l8'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Extend classrooms with department and semester
    op.add_column('classrooms', sqla.Column('department', sqla.String(length=100), nullable=True))
    op.add_column('classrooms', sqla.Column('semester', sqla.String(length=50), nullable=True))

    # 2. Create course_enrollments table
    op.create_table(
        'course_enrollments',
        sqla.Column('id', UUID(as_uuid=True), primary_key=True),
        sqla.Column('classroom_id', UUID(as_uuid=True), sqla.ForeignKey('classrooms.id', ondelete='CASCADE'), nullable=False),
        sqla.Column('student_id', UUID(as_uuid=True), sqla.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sqla.Column('enrolled_at', sqla.DateTime(timezone=True), server_default=sqla.func.now(), nullable=False),
        sqla.UniqueConstraint('classroom_id', 'student_id', name='uq_course_enrollment'),
    )
    op.create_index(op.f('ix_course_enrollments_classroom_id'), 'course_enrollments', ['classroom_id'], unique=False)
    op.create_index(op.f('ix_course_enrollments_student_id'), 'course_enrollments', ['student_id'], unique=False)

    # 3. Create attendance_events table
    op.create_table(
        'attendance_events',
        sqla.Column('id', UUID(as_uuid=True), primary_key=True),
        sqla.Column('session_id', UUID(as_uuid=True), sqla.ForeignKey('class_sessions.id', ondelete='CASCADE'), nullable=False),
        sqla.Column('student_id', UUID(as_uuid=True), sqla.ForeignKey('student_profiles.id', ondelete='CASCADE'), nullable=False),
        sqla.Column('event_type', sqla.String(length=50), nullable=False),
        sqla.Column('timestamp', sqla.DateTime(timezone=True), server_default=sqla.func.now(), nullable=False),
        sqla.Column('details', sqla.Text(), nullable=True),
    )
    op.create_index(op.f('ix_attendance_events_session_id'), 'attendance_events', ['session_id'], unique=False)
    op.create_index(op.f('ix_attendance_events_student_id'), 'attendance_events', ['student_id'], unique=False)

    # 4. Extend attendance_records with time-based fields
    op.add_column('attendance_records', sqla.Column('missing_duration_seconds', sqla.Integer(), server_default='0', nullable=False))
    op.add_column('attendance_records', sqla.Column('attendance_percentage', sqla.Float(), server_default='0.0', nullable=True))
    op.add_column('attendance_records', sqla.Column('verification_state', sqla.String(length=50), server_default='PRESENT', nullable=True))
    op.add_column('attendance_records', sqla.Column('last_detected_at', sqla.DateTime(timezone=True), nullable=True))
    op.add_column('attendance_records', sqla.Column('last_missing_at', sqla.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('attendance_records', 'last_missing_at')
    op.drop_column('attendance_records', 'last_detected_at')
    op.drop_column('attendance_records', 'verification_state')
    op.drop_column('attendance_records', 'attendance_percentage')
    op.drop_column('attendance_records', 'missing_duration_seconds')

    op.drop_index(op.f('ix_attendance_events_student_id'), table_name='attendance_events')
    op.drop_index(op.f('ix_attendance_events_session_id'), table_name='attendance_events')
    op.drop_table('attendance_events')

    op.drop_index(op.f('ix_course_enrollments_student_id'), table_name='course_enrollments')
    op.drop_index(op.f('ix_course_enrollments_classroom_id'), table_name='course_enrollments')
    op.drop_table('course_enrollments')

    op.drop_column('classrooms', 'semester')
    op.drop_column('classrooms', 'department')
