import requests

from techpilot_agent.config import AGENT_TOKEN


class TechPilotClient:

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {AGENT_TOKEN}",
        }

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
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def send_telemetry(self, telemetry_data: dict) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/telemetry/",
            json=telemetry_data,
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def send_network_telemetry(self, network_data: dict) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/security/network/telemetry",
            json=network_data,
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def get_pending_remote_session(self, device_id: str) -> dict:
        response = requests.get(
            f"{self.base_url}/api/v1/remote/sessions/pending/{device_id}",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def accept_remote_session(self, session_id: int) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/remote/sessions/{session_id}/accept",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def connect_remote_session(self, session_id: int) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/remote/sessions/{session_id}/connect",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def disconnect_remote_session(self, session_id: int) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/remote/sessions/"
            f"{session_id}/disconnect",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    # ------------------------------------------------------------------
    # Shell session / command API
    # ------------------------------------------------------------------

    def get_pending_shell_session(self, device_id: str) -> dict:
        response = requests.get(
            f"{self.base_url}/api/v1/shell/agent/sessions/"
            f"pending/{device_id}",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def accept_shell_session(self, session_id: int) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/shell/agent/sessions/"
            f"{session_id}/accept",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def get_pending_shell_command(self, session_id: int) -> dict:
        response = requests.get(
            f"{self.base_url}/api/v1/shell/agent/sessions/"
            f"{session_id}/commands/pending",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def submit_shell_command_result(
        self,
        command_id: int,
        result: dict,
    ) -> dict:
        response = requests.post(
            f"{self.base_url}/api/v1/shell/agent/commands/"
            f"{command_id}/result",
            json=result,
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()

    def get_shell_session_status(self, session_id: int) -> dict:
        response = requests.get(
            f"{self.base_url}/api/v1/shell/agent/sessions/"
            f"{session_id}/status",
            headers=self._headers(),
            timeout=10,
        )
        response.raise_for_status()
        return response.json()