from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models
from app.api.agents import router as agents_router
from app.api.telemetry import router as telemetry_router
from app.api.remote import router as remote_router
from app.api.auth import router as auth_router
from app.config import CORS_ORIGINS
from app.api.organizations import router as organizations_router
from app.api.device_enrollment import router as device_enrollment_router
from app.api import shell


app = FastAPI(
    title="TechAIPILOT API",
    description="Intelligent IT Operations & Secure Remote Support Platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(telemetry_router)
app.include_router(remote_router)
app.include_router(auth_router)
app.include_router(organizations_router)
app.include_router(device_enrollment_router)
app.include_router(shell.router)

@app.get("/")
def root():
    return {
        "product": "TechAIPILOT",
        "status": "online",
        "version": "0.1.0",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "TechAIPILOT API",
    }