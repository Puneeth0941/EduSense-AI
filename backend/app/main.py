from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.classrooms import router as classrooms_router
from app.api.sessions import router as sessions_router

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


@app.get("/")
def root():
    return {
        "message": "Welcome to EduSense AI API",
        "docs": "/docs",
        "health": f"{settings.API_V1_PREFIX}/health",
    }
