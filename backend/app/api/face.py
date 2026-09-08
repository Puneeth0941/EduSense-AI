import logging
from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_db, get_current_user, require_role
from app.models.user import User
from app.models.enums import UserRole
from app.models.stubs import FaceEmbedding
from app.models.profile import StudentProfile
from app.services.face_service import FaceService
from app.schemas.face import (
    FaceCaptureRequest,
    FaceCaptureResponse,
    EnrollmentCompleteRequest,
    EnrollmentCompleteResponse,
    EnrollmentStatusResponse,
    FaceVerificationRequest,
    FaceVerificationResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/enrollment/capture",
    response_model=FaceCaptureResponse,
    summary="Validate frame quality and generate embedding sample",
)
def capture_enrollment_sample(
    payload: FaceCaptureRequest,
    current_user: User = Depends(require_role([UserRole.STUDENT])),
) -> Any:
    """
    Receives a single webcam frame (base64) from an authenticated student.
    Performs single-face detection (SCRFD) and quality checks (size, blur, lighting, orientation).
    If valid, returns the ArcFace 512-dim embedding for this frame.
    """
    if not current_user.student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an active Student Profile",
        )

    try:
        service = FaceService.get_instance()
        result = service.process_frame(payload.image_base64)
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        logger.error(f"Error during face sample capture: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process face frame. Please try again.",
        )


@router.post(
    "/enrollment/complete",
    response_model=EnrollmentCompleteResponse,
    summary="Complete student face enrollment with 5 quality samples",
)
def complete_face_enrollment(
    payload: EnrollmentCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.STUDENT])),
) -> Any:
    """
    Receives 5 sample face embeddings.
    Performs cross-sample consistency verification to ensure all samples belong to the same student.
    Computes mean normalized ArcFace embedding vector and securely stores it in PostgreSQL.
    """
    student_profile = current_user.student_profile
    if not student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an active Student Profile",
        )

    if len(payload.sample_embeddings) != 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enrollment requires exactly 5 quality face samples.",
        )

    service = FaceService.get_instance()

    # Cross-sample consistency check
    is_consistent, score = service.verify_consistency(payload.sample_embeddings)
    if not is_consistent:
        logger.warning(
            f"Face enrollment rejected for student {student_profile.id}: low sample consistency ({score})"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Inconsistent face samples detected (consistency score: {score}). Please capture samples again in a well-lit area.",
        )

    # Compute mean normalized embedding
    mean_embedding = service.compute_mean_embedding(payload.sample_embeddings)

    embedding_payload = {
        "sample_embeddings": payload.sample_embeddings,
        "mean_embedding": mean_embedding,
        "num_samples": len(payload.sample_embeddings),
        "consistency_score": score,
        "enrolled_at": datetime.now().isoformat(),
    }

    # Check for existing enrollment record
    existing_record = (
        db.query(FaceEmbedding)
        .filter(FaceEmbedding.student_id == student_profile.id)
        .first()
    )

    if existing_record:
        existing_record.embedding_data = embedding_payload
        existing_record.embedding_dim = 512
        existing_record.updated_at = datetime.now()
        db.commit()
        db.refresh(existing_record)
        enrolled_time = existing_record.updated_at.isoformat()
        logger.info(f"Updated face enrollment for student {student_profile.id}")
    else:
        new_record = FaceEmbedding(
            student_id=student_profile.id,
            embedding_dim=512,
            embedding_data=embedding_payload,
        )
        db.add(new_record)
        db.commit()
        db.refresh(new_record)
        enrolled_time = new_record.created_at.isoformat()
        logger.info(f"Created new face enrollment for student {student_profile.id}")

    return EnrollmentCompleteResponse(
        success=True,
        message="Face enrollment completed successfully",
        enrolled_at=enrolled_time,
        consistency_score=score,
    )


@router.get(
    "/enrollment/status",
    response_model=EnrollmentStatusResponse,
    summary="Get face enrollment status for current student",
)
def get_enrollment_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    Returns enrollment status for the current logged in student.
    Teachers viewing or student viewing.
    """
    student_profile = current_user.student_profile
    if not student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current user is not registered as a student",
        )

    record = (
        db.query(FaceEmbedding)
        .filter(FaceEmbedding.student_id == student_profile.id)
        .first()
    )

    is_enrolled = record is not None and record.embedding_data is not None
    enrolled_at = None
    if is_enrolled and record:
        if isinstance(record.embedding_data, dict):
            enrolled_at = record.embedding_data.get("enrolled_at")
        if not enrolled_at and record.created_at:
            enrolled_at = record.created_at.isoformat()

    return EnrollmentStatusResponse(
        is_enrolled=is_enrolled,
        enrolled_at=enrolled_at,
        student_id=str(student_profile.id),
        student_name=current_user.full_name,
        student_id_number=student_profile.student_id_number,
        embedding_dim=record.embedding_dim if record else 512,
    )


@router.delete(
    "/enrollment",
    summary="Delete existing face enrollment data for student",
)
def delete_face_enrollment(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.STUDENT])),
) -> Any:
    """
    Deletes current face embedding record to allow controlled re-enrollment.
    """
    student_profile = current_user.student_profile
    if not student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an active Student Profile",
        )

    record = (
        db.query(FaceEmbedding)
        .filter(FaceEmbedding.student_id == student_profile.id)
        .first()
    )

    if record:
        db.delete(record)
        db.commit()
        logger.info(f"Deleted face enrollment for student {student_profile.id}")

    return {"message": "Face enrollment deleted successfully. You can now re-enroll."}


@router.post(
    "/verification",
    response_model=FaceVerificationResponse,
    summary="Verify student face identity using fresh webcam image frame",
)
def verify_student_face(
    payload: FaceVerificationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.STUDENT])),
) -> Any:
    """
    Receives a fresh webcam image frame (base64) from an authenticated student.
    Fetches the student's enrolled face embeddings from PostgreSQL.
    Rejects verification if no enrollment exists.
    Detects faces (requires exactly 1 face), executes quality checks, generates a NEW ArcFace embedding vector.
    Compares the new vector against stored enrollment embeddings using cosine similarity.
    Returns clean verification result without exposing raw vectors or internal data.
    """
    student_profile = current_user.student_profile
    if not student_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an active Student Profile",
        )

    record = (
        db.query(FaceEmbedding)
        .filter(FaceEmbedding.student_id == student_profile.id)
        .first()
    )

    if not record or not record.embedding_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No face profile enrolled. Please complete face enrollment first.",
        )

    try:
        service = FaceService.get_instance()
        identity_label = f"student_{student_profile.student_id_number}"
        result = service.verify_face_against_enrolled(
            payload.image_base64,
            record.embedding_data,
            student_identity=identity_label,
        )
        return result
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve),
        )
    except Exception as e:
        logger.error(f"Error during face verification: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process verification request. Please try again.",
        )

