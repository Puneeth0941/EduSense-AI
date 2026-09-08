from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class FaceCaptureRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded webcam image frame")
    pose_label: Optional[str] = Field(None, description="Current sample target pose (e.g., front, left, right, up, down)")


class FaceCaptureResponse(BaseModel):
    passed: bool = Field(..., description="True if frame passes single face and quality checks")
    num_faces: int = Field(..., description="Number of faces detected in frame")
    message: str = Field(..., description="User feedback message")
    embedding: Optional[List[float]] = Field(None, description="ArcFace 512-dim embedding vector if sample passed")
    quality_details: Optional[Dict[str, Any]] = Field(None, description="Quality metrics such as blur score and size")


class EnrollmentCompleteRequest(BaseModel):
    sample_embeddings: List[List[float]] = Field(..., description="List of 5 sample face embedding vectors")
    poses: Optional[List[str]] = Field(None, description="Optional list of sample pose labels")


class EnrollmentCompleteResponse(BaseModel):
    success: bool = Field(..., description="True if enrollment completed successfully")
    message: str = Field(..., description="Confirmation or error message")
    enrolled_at: Optional[str] = Field(None, description="ISO timestamp of enrollment completion")
    consistency_score: Optional[float] = Field(None, description="Average similarity score across the 5 samples")


class EnrollmentStatusResponse(BaseModel):
    is_enrolled: bool = Field(..., description="True if student has an active face embedding enrolled")
    enrolled_at: Optional[str] = Field(None, description="ISO timestamp when face was enrolled")
    student_id: str = Field(..., description="Student profile UUID")
    student_name: str = Field(..., description="Student full name")
    student_id_number: str = Field(..., description="Student roll/ID number")
    embedding_dim: int = Field(512, description="Dimension of ArcFace embeddings")


class FaceVerificationRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded webcam image frame for verification")


class FaceVerificationResponse(BaseModel):
    verified: bool = Field(..., description="True if face matches the enrolled student profile")
    identity: Optional[str] = Field(None, description="Identity label of matching student or None if unverified")
    similarity: float = Field(..., description="Similarity score between new frame and enrolled profile (0.0 - 1.0)")
    message: str = Field(..., description="Verification status feedback message")
    quality_details: Optional[Dict[str, Any]] = Field(None, description="Quality metrics for verification frame")

