from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.api.health import router as health_router, check_health
from app.api.auth import router as auth_router
from app.api.classrooms import router as classrooms_router
from app.api.sessions import router as sessions_router
from app.api.face import router as face_router
from app.api.attendance import router as attendance_router
from app.api.analytics import router as analytics_router
from app.api.transcription import router as transcription_router

app = FastAPI(
    title="EduSense AI API",
    description="Smart Classroom Attendance and Student Engagement Analytics Platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(health_router, prefix=settings.API_V1_PREFIX, tags=["Health"])
app.include_router(auth_router, prefix=f"{settings.API_V1_PREFIX}/auth", tags=["Auth"])
app.include_router(classrooms_router, prefix=f"{settings.API_V1_PREFIX}/classrooms", tags=["Classrooms"])
app.include_router(sessions_router, prefix=settings.API_V1_PREFIX, tags=["Sessions"])
app.include_router(face_router, prefix=f"{settings.API_V1_PREFIX}/face", tags=["Face Recognition"])
app.include_router(attendance_router, prefix=f"{settings.API_V1_PREFIX}/attendance", tags=["Attendance"])
app.include_router(analytics_router, prefix=f"{settings.API_V1_PREFIX}/analytics", tags=["Engagement Analytics"])
app.include_router(transcription_router, prefix=f"{settings.API_V1_PREFIX}/transcription", tags=["Speech Transcription"])




@app.get("/health")
def health_alias(db: Session = Depends(get_db)):
    return check_health(db)


@app.get("/")
def root():
    return {
        "message": "Welcome to EduSense AI API",
        "docs": "/docs",
        "health": f"{settings.API_V1_PREFIX}/health",
    }
