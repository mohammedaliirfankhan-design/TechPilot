from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.agents import router as agents_router
from app.api.telemetry import router as telemetry_router
from app.database import Base, engine
from app.models.agent import Agent
from app.models.telemetry import Telemetry
from app.models.alert import Alert
from app.models.remote_session import RemoteSession
from app.api.remote import router as remote_router
from app.models.user import User
from app.api.auth import router as auth_router


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="TechPilot API",
    description="Intelligent IT Operations & Secure Remote Support Platform",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router)
app.include_router(telemetry_router)
app.include_router(remote_router)
app.include_router(auth_router)

@app.get("/")
def root():
    return {
        "product": "TechPilot",
        "status": "online",
        "version": "0.1.0",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "TechPilot API",
    }