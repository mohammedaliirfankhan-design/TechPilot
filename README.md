# TechAIPILOT

## Intelligent IT Operations & Secure Remote Support Platform

TechAIPILOT is a Windows endpoint management and secure remote-support platform consisting of:

- A Windows endpoint Agent
- A FastAPI backend
- PostgreSQL database
- React web administration console
- Secure customer device enrollment
- Remote desktop screen streaming and control
- Endpoint telemetry and management

## Current Release

**Version:** `1.0.0`

**Release status:** Stable MVP / v1.0 release

The v1.0 release provides a complete customer onboarding and remote-support workflow:

1. Customer creates a device enrollment code from the web console.
2. Customer installs the Windows Agent.
3. Agent is enrolled using the temporary enrollment code.
4. Backend securely associates the Agent with the customer's organization.
5. Agent starts automatically when the Windows user logs in.
6. Customer can view endpoint status and telemetry.
7. Customer can initiate a remote support session.
8. Agent streams the Windows desktop to the web console.
9. Authorized users can control the remote desktop.
10. Sessions can be ended cleanly from the console.

---

## Architecture

```text
                         TechAIPILOT Console
                         React / Vite
                               |
                               | HTTPS / WSS
                               v
                     +----------------------+
                     |   FastAPI Backend     |
                     |                      |
                     | Authentication       |
                     | Organizations        |
                     | Agents               |
                     | Enrollment           |
                     | Remote Sessions      |
                     +----------+-----------+
                                |
                     +----------+-----------+
                     |                      |
                     v                      v
                PostgreSQL          Windows Agent
                                      |
                                      v
                              Customer Windows PC