from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db
from app.schemas.health import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, status_code=status.HTTP_200_OK)
def check_health(db: Session = Depends(get_db)):
    """
    Health check endpoint that verifies the backend service is running
    and validates PostgreSQL database session connectivity.
    """
    db_status = "disconnected"
    try:
        # Execute light query to verify DB connection
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "degraded",
                "service": "EduSense AI API",
                "database": db_status,
            },
        )

    return HealthResponse(
        status="healthy",
        service="EduSense AI API",
        database=db_status,
    )
