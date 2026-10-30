import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, func, or_

from app.core.deps import get_db, get_current_user, require_role
from app.models.user import User
from app.models.classroom import Classroom, CourseEnrollment
from app.models.profile import StudentProfile, TeacherProfile
from app.models.stubs import FaceEmbedding
from app.models.enums import UserRole
from app.schemas.classroom import (
    ClassroomCreateSchema,
    ClassroomResponseSchema,
    EnrollStudentSchema,
    JoinCourseSchema,
    EnrolledStudentResponseSchema,
    RegisteredStudentResponseSchema,
)
from app.services.classroom_service import get_authorized_classrooms, get_authorized_classroom_ids

router = APIRouter()


def _build_classroom_response(c: Classroom, current_user: User, db: Session) -> ClassroomResponseSchema:
    item = ClassroomResponseSchema.model_validate(c)
    if c.teacher and c.teacher.user:
        item.teacher_name = c.teacher.user.full_name
    elif current_user.role == UserRole.TEACHER:
        item.teacher_name = current_user.full_name

    item.department = c.department
    item.semester = c.semester

    enrollment_count = db.scalar(
        select(func.count(CourseEnrollment.id)).where(CourseEnrollment.classroom_id == c.id)
    )
    item.enrolled_student_count = enrollment_count or 0

    if current_user.role == UserRole.STUDENT and current_user.student_profile:
        is_enr = db.scalar(
            select(CourseEnrollment.id).where(
                CourseEnrollment.classroom_id == c.id,
                CourseEnrollment.student_id == current_user.student_profile.id,
            )
        )
        item.is_enrolled = is_enr is not None
    else:
        item.is_enrolled = False

    return item


@router.post("/", response_model=ClassroomResponseSchema, status_code=status.HTTP_201_CREATED)
def create_classroom(
    data: ClassroomCreateSchema,
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """Create a new course / classroom. Restricted to TEACHER role."""
    if not current_user.teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher profile missing for this account.",
        )

    # Check for existing course_code
    existing = db.scalar(
        select(Classroom).where(func.lower(Classroom.course_code) == data.course_code.strip().lower())
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Course code '{data.course_code}' is already in use.",
        )

    room_uuid = uuid.uuid4()
    livekit_room_name = f"classroom_{room_uuid}"

    classroom = Classroom(
        title=data.title.strip(),
        description=data.description.strip() if data.description else None,
        course_code=data.course_code.strip().upper(),
        department=data.department.strip() if data.department else None,
        semester=data.semester.strip() if data.semester else None,
        teacher_id=current_user.teacher_profile.id,
        livekit_room_name=livekit_room_name,
        is_active=True,
    )
    db.add(classroom)
    db.commit()
    db.refresh(classroom)

    res = _build_classroom_response(classroom, current_user, db)
    return res


@router.get("/registered-students", response_model=List[RegisteredStudentResponseSchema])
def list_registered_students(
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """List all registered students in the institution. Restricted to TEACHER role."""
    students = (
        db.scalars(
            select(StudentProfile)
            .options(
                joinedload(StudentProfile.user),
                joinedload(StudentProfile.face_embedding),
            )
            .order_by(StudentProfile.student_id_number)
        )
        .unique()
        .all()
    )

    result = []
    for s in students:
        if not s.user:
            continue
        result.append(
            RegisteredStudentResponseSchema(
                student_id=s.id,
                user_id=s.user.id,
                full_name=s.user.full_name,
                email=s.user.email,
                student_id_number=s.student_id_number,
                department=s.department,
                enrollment_year=s.enrollment_year,
                has_face_enrolled=s.face_embedding is not None,
            )
        )
    return result


@router.get("/enrolled", response_model=List[ClassroomResponseSchema])
def list_enrolled_courses(
    current_user: User = Depends(require_role([UserRole.STUDENT])),
    db: Session = Depends(get_db),
):
    """List courses the current student has explicitly enrolled in."""
    if not current_user.student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student profile missing for this account.",
        )

    enrollments = (
        db.scalars(
            select(CourseEnrollment)
            .options(
                joinedload(CourseEnrollment.classroom).joinedload(Classroom.teacher).joinedload(TeacherProfile.user)
            )
            .where(CourseEnrollment.student_id == current_user.student_profile.id)
            .order_by(CourseEnrollment.created_at.desc())
        )
        .unique()
        .all()
    )

    result = []
    for enr in enrollments:
        if enr.classroom and enr.classroom.is_active:
            res = _build_classroom_response(enr.classroom, current_user, db)
            res.is_enrolled = True
            result.append(res)
    return result


@router.post("/join", response_model=ClassroomResponseSchema)
def join_course_by_code(
    data: JoinCourseSchema,
    current_user: User = Depends(require_role([UserRole.STUDENT])),
    db: Session = Depends(get_db),
):
    """Student joins a course using the course code."""
    if not current_user.student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student profile missing for this account.",
        )

    clean_code = data.course_code.strip().upper()
    classroom = db.scalar(
        select(Classroom)
        .options(joinedload(Classroom.teacher).joinedload(TeacherProfile.user))
        .where(func.upper(Classroom.course_code) == clean_code, Classroom.is_active == True)
    )
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Course with code '{clean_code}' not found or is inactive.",
        )

    # Check for existing enrollment
    existing = db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.classroom_id == classroom.id,
            CourseEnrollment.student_id == current_user.student_profile.id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already enrolled in this course.",
        )

    enrollment = CourseEnrollment(
        classroom_id=classroom.id,
        student_id=current_user.student_profile.id,
    )
    db.add(enrollment)
    db.commit()

    res = _build_classroom_response(classroom, current_user, db)
    res.is_enrolled = True
    return res


@router.get("/", response_model=List[ClassroomResponseSchema])
def list_classrooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List classrooms accessible to current user."""
    classrooms = get_authorized_classrooms(db, current_user)
    result = [_build_classroom_response(c, current_user, db) for c in classrooms]
    return result


@router.get("/{classroom_id}", response_model=ClassroomResponseSchema)
def get_classroom_detail(
    classroom_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get classroom details by ID."""
    authorized_ids = get_authorized_classroom_ids(db, current_user)
    if classroom_id not in authorized_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found.",
        )

    classroom = db.scalar(
        select(Classroom)
        .options(joinedload(Classroom.teacher).joinedload(TeacherProfile.user))
        .where(Classroom.id == classroom_id)
    )
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found.",
        )

    return _build_classroom_response(classroom, current_user, db)


@router.get("/{classroom_id}/students", response_model=List[EnrolledStudentResponseSchema])
def list_enrolled_students(
    classroom_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all students enrolled in a classroom."""
    classroom = db.scalar(select(Classroom).where(Classroom.id == classroom_id))
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found.",
        )

    # If teacher, verify ownership
    if current_user.role == UserRole.TEACHER:
        if not current_user.teacher_profile or classroom.teacher_id != current_user.teacher_profile.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to manage this course.",
            )

    enrollments = (
        db.scalars(
            select(CourseEnrollment)
            .options(
                joinedload(CourseEnrollment.student).joinedload(StudentProfile.user),
                joinedload(CourseEnrollment.student).joinedload(StudentProfile.face_embedding),
            )
            .where(CourseEnrollment.classroom_id == classroom_id)
            .order_by(CourseEnrollment.enrolled_at.asc())
        )
        .unique()
        .all()
    )

    result = []
    for enr in enrollments:
        student = enr.student
        if not student or not student.user:
            continue
        result.append(
            EnrolledStudentResponseSchema(
                enrollment_id=enr.id,
                student_id=student.id,
                user_id=student.user.id,
                full_name=student.user.full_name,
                email=student.user.email,
                student_id_number=student.student_id_number,
                department=student.department,
                enrollment_year=student.enrollment_year,
                enrolled_at=enr.enrolled_at,
                has_face_enrolled=student.face_embedding is not None,
            )
        )
    return result


@router.post("/{classroom_id}/enroll", response_model=EnrolledStudentResponseSchema, status_code=status.HTTP_201_CREATED)
def enroll_student_into_course(
    classroom_id: uuid.UUID,
    data: EnrollStudentSchema,
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """Teacher enrolls an existing registered student into the course."""
    if not current_user.teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher profile missing for this account.",
        )

    classroom = db.scalar(select(Classroom).where(Classroom.id == classroom_id))
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found.",
        )

    if classroom.teacher_id != current_user.teacher_profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to enroll students into this course.",
        )

    # Locate student by student_id or student_id_number
    student = None
    if data.student_id:
        student = db.scalar(
            select(StudentProfile)
            .options(joinedload(StudentProfile.user), joinedload(StudentProfile.face_embedding))
            .where(StudentProfile.id == data.student_id)
        )
    elif data.student_id_number:
        clean_usn = data.student_id_number.strip().upper()
        student = db.scalar(
            select(StudentProfile)
            .options(joinedload(StudentProfile.user), joinedload(StudentProfile.face_embedding))
            .where(func.upper(StudentProfile.student_id_number) == clean_usn)
        )

    if not student:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found with provided ID or USN.",
        )

    # Check for existing enrollment
    existing = db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.classroom_id == classroom_id,
            CourseEnrollment.student_id == student.id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Student '{student.user.full_name}' ({student.student_id_number}) is already enrolled in this course.",
        )

    enrollment = CourseEnrollment(
        classroom_id=classroom_id,
        student_id=student.id,
    )
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)

    return EnrolledStudentResponseSchema(
        enrollment_id=enrollment.id,
        student_id=student.id,
        user_id=student.user.id,
        full_name=student.user.full_name,
        email=student.user.email,
        student_id_number=student.student_id_number,
        department=student.department,
        enrollment_year=student.enrollment_year,
        enrolled_at=enrollment.enrolled_at,
        has_face_enrolled=student.face_embedding is not None,
    )


@router.delete("/{classroom_id}/students/{student_id}", status_code=status.HTTP_200_OK)
def remove_student_from_course(
    classroom_id: uuid.UUID,
    student_id: uuid.UUID,
    current_user: User = Depends(require_role([UserRole.TEACHER])),
    db: Session = Depends(get_db),
):
    """Teacher removes an enrolled student from the course."""
    if not current_user.teacher_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teacher profile missing for this account.",
        )

    classroom = db.scalar(select(Classroom).where(Classroom.id == classroom_id))
    if not classroom:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Classroom not found.",
        )

    if classroom.teacher_id != current_user.teacher_profile.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to modify enrollments for this course.",
        )

    enrollment = db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.classroom_id == classroom_id,
            CourseEnrollment.student_id == student_id,
        )
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student enrollment record not found in this course.",
        )

    db.delete(enrollment)
    db.commit()
    return {"detail": "Student removed from course successfully."}
