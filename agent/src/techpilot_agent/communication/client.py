import requests


class TechPilotClient:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def register_agent(self, agent_data: dict) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/agents/register",
            json=agent_data,
            timeout=10,
        )

        response.raise_for_status()
        return response.json()

    def heartbeat(self, device_id: str) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/agents/{device_id}/heartbeat",
            timeout=10,
        )

        response.raise_for_status()
        return response.json()

    def send_telemetry(self, telemetry_data: dict) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/telemetry/",
            json=telemetry_data,
            timeout=10,
        )

        response.raise_for_status()
        return response.json()
    def get_pending_remote_session(self, device_id: str) -> dict:
        response = requests.get(
        f"{self.base_url}/api/v1/remote/sessions/pending/{device_id}",
        timeout=10,
    )
        response.raise_for_status()
        return response.json()

    def accept_remote_session(self, session_id: int) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/remote/sessions/{session_id}/accept",
            timeout=10
        )

        response.raise_for_status()
        return response.json()
    
    def connect_remote_session(self, session_id: int) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/remote/sessions/{session_id}/connect",
            timeout=10,
        )

        response.raise_for_status()
        return response.json()


    def get_remote_session(self, session_id: int) -> dict:
        response = requests.get(
        f"{self.base_url}/api/v1/remote/sessions/{session_id}",
        timeout=10,
    )

        response.raise_for_status()
        return response.json()