from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.deps import get_db, get_current_user
from app.core.security import get_password_hash, verify_password, create_access_token
from app.models.user import User
from app.models.profile import TeacherProfile, StudentProfile
from app.models.enums import UserRole
from app.schemas.auth import (
    TeacherRegisterSchema,
    StudentRegisterSchema,
    LoginSchema,
    TokenResponseSchema,
    UserResponseSchema,
)

router = APIRouter()


@router.post("/register/teacher", response_model=UserResponseSchema, status_code=status.HTTP_201_CREATED)
def register_teacher(data: TeacherRegisterSchema, db: Session = Depends(get_db)):
    """Register a new Teacher user with TeacherProfile."""
    # Check email uniqueness
    existing_user = db.scalar(select(User).where(User.email == data.email))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )
    
    # Check employee_id uniqueness
    existing_emp = db.scalar(select(TeacherProfile).where(TeacherProfile.employee_id == data.employee_id))
    if existing_emp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A teacher with this employee ID already exists.",
        )
    
    hashed_pwd = get_password_hash(data.password)
    user = User(
        email=data.email,
        password_hash=hashed_pwd,
        full_name=data.full_name,
        role=UserRole.TEACHER,
        is_active=True,
    )
    db.add(user)
    db.flush()  # populate user.id
    
    profile = TeacherProfile(
        user_id=user.id,
        employee_id=data.employee_id,
        department=data.department,
        designation=data.designation,
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user


@router.post("/register/student", response_model=UserResponseSchema, status_code=status.HTTP_201_CREATED)
def register_student(data: StudentRegisterSchema, db: Session = Depends(get_db)):
    """Register a new Student user with StudentProfile."""
    # Check email uniqueness
    existing_user = db.scalar(select(User).where(User.email == data.email))
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )
    
    # Check student_id_number uniqueness
    existing_student_id = db.scalar(select(StudentProfile).where(StudentProfile.student_id_number == data.student_id_number))
    if existing_student_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A student with this student ID number already exists.",
        )
    
    hashed_pwd = get_password_hash(data.password)
    user = User(
        email=data.email,
        password_hash=hashed_pwd,
        full_name=data.full_name,
        role=UserRole.STUDENT,
        is_active=True,
    )
    db.add(user)
    db.flush()
    
    profile = StudentProfile(
        user_id=user.id,
        student_id_number=data.student_id_number,
        department=data.department,
        enrollment_year=data.enrollment_year,
    )
    db.add(profile)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponseSchema)
def login(data: LoginSchema, db: Session = Depends(get_db)):
    """Authenticate user with email and password, return JWT token."""
    user = db.scalar(select(User).where(User.email == data.email))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )
    
    access_token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return TokenResponseSchema(
        access_token=access_token,
        token_type="bearer",
        user=user,
    )


@router.get("/me", response_model=UserResponseSchema)
def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return current_user
