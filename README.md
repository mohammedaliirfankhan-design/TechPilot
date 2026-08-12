# TechPilot

## Intelligent IT Operations & Secure Remote Support Platform

TechPilot is an enterprise-focused platform designed to combine secure remote technical assistance, endpoint intelligence, automated diagnostics, controlled remediation, security assessment, and IT operations analytics.

## MVP v0.1

The first version focuses on:

- Windows endpoint agent
- Centralized endpoint management
- System telemetry
- Endpoint diagnostics
- Controlled remediation
- Audit logging
- Web-based administration console

## Architecture

Windows Endpoint
        |
        v
TechPilot Agent
        |
        v
TechPilot API
        |
        +---- PostgreSQL
        |
        v
TechPilot Console

## Project Structure

- `backend/` — FastAPI backend and APIs
- `agent/` — Windows endpoint agent
- `frontend/` — React administration console
- `docs/` — Architecture, API, security and phase documentation
- `scripts/` — Development and deployment utilities

## Development Status

**Current Phase:** MVP v0.1 — Foundation