import time

from techpilot_agent.communication.client import TechPilotClient
from techpilot_agent.identity.device_id import get_device_id
from techpilot_agent.telemetry.collector import collect_telemetry
from remote.stream import RemoteScreenStreamer


BACKEND_URL = "http://192.168.0.69:8000"
HEARTBEAT_INTERVAL = 30


def main(debug=False):
    print("Starting TechPilot Agent...")

    if debug:
        print("[DEBUG] Debug mode enabled")
        print(f"[DEBUG] Backend URL: {BACKEND_URL}")
        print(f"[DEBUG] Heartbeat interval: {HEARTBEAT_INTERVAL}s")

    # -------------------------
    # Device Identity
    # -------------------------
    device_id = get_device_id()

    print(f"Device ID: {device_id}")

    if debug:
        print(f"[DEBUG] Device ID loaded: {device_id}")

    # -------------------------
    # Backend Client
    # -------------------------
    client = TechPilotClient(BACKEND_URL)

    if debug:
        print("[DEBUG] Backend client initialized")

    # -------------------------
    # Initial Telemetry
    # -------------------------
    telemetry = collect_telemetry()

    if debug:
        print(f"[DEBUG] Initial telemetry: {telemetry}")

    agent_data = {
        "device_id": device_id,
        "hostname": telemetry["hostname"],
        "operating_system": telemetry["operating_system"],
        "os_version": telemetry["os_version"],
        "agent_version": "0.1.0",
    }

    if debug:
        print(f"[DEBUG] Agent registration data: {agent_data}")

    # -------------------------
    # Register Agent
    # -------------------------
    print("Registering agent...")

    registration = client.register_agent(agent_data)

    print(f"Registration response: {registration}")

    if debug:
        print("[DEBUG] Agent registration completed")

    # Keep track of the remote session
    # currently being handled by the agent.
    last_remote_session_id = None

    # -------------------------
    # Main Agent Loop
    # -------------------------
    while True:

        try:

            if debug:
                print("\n[DEBUG] Starting new agent cycle")

            # -------------------------
            # Collect Telemetry
            # -------------------------
            telemetry = collect_telemetry()

            if debug:
                print(f"[DEBUG] Telemetry collected: {telemetry}")

            telemetry_data = {
                "device_id": device_id,
                "hostname": telemetry["hostname"],
                "cpu_percent": telemetry["cpu_percent"],
                "memory_percent": telemetry["memory_percent"],
                "disk_percent": telemetry["disk_percent"],
            }

            if debug:
                print(
                    f"[DEBUG] Sending telemetry: "
                    f"{telemetry_data}"
                )

            telemetry_response = client.send_telemetry(
                telemetry_data
            )

            print(
                f"Telemetry sent: {telemetry_response}"
            )

            # -------------------------
            # Heartbeat
            # -------------------------
            if debug:
                print(
                    f"[DEBUG] Sending heartbeat "
                    f"for device: {device_id}"
                )

            heartbeat = client.heartbeat(device_id)

            print(
                f"Heartbeat: {heartbeat}"
            )

            # -------------------------
            # Remote Support
            # -------------------------
            if debug:
                print("[DEBUG] Checking for pending remote session")

            remote_session = client.get_pending_remote_session(
                device_id
            )

            if debug:
                print(
                    f"[DEBUG] Remote session response: "
                    f"{remote_session}"
                )

            if remote_session.get("pending"):

                session_id = remote_session.get("session_id")
                session_status = remote_session.get("status")

                if debug:
                    print(
                        f"[DEBUG] Pending session detected - "
                        f"ID: {session_id}, "
                        f"Status: {session_status}"
                    )

                # Only process a new session once
                if (
    session_id != last_remote_session_id
    or session_status in ("ACCEPTED", "CONNECTING")
):

                    print(
                        "Remote support session detected! "
                        f"Session ID: {session_id}, "
                        f"Status: {session_status}"
                    )

                    # -------------------------
                    # Accept Requested Session
                    # -------------------------
                    if session_status == "REQUESTED":

                        if debug:
                            print(
                                f"[DEBUG] Accepting remote session "
                                f"{session_id}"
                            )

                        accepted_session = (
                            client.accept_remote_session(
                                session_id
                            )
                        )

                        print(
                            f"Remote session accepted: "
                            f"{accepted_session}"
                        )

                        if debug:
                            print(
                                "[DEBUG] Connecting to accepted "
                                "remote session"
                            )

                        connected_session = (
                            client.connect_remote_session(
                                session_id
                            )
                        )

                        print(
                            f"Remote session connecting: "
                            f"{connected_session}"
                        )

                        # The backend has now moved
                        # the session to ACCEPTED.
                        session_status = "ACCEPTED"

                        if debug:
                            print(
                                "[DEBUG] Session status changed "
                                "to ACCEPTED"
                            )

                    # -------------------------
                    # Already Accepted Session
                    # -------------------------
                    elif session_status == "ACCEPTED":

                        print(
                            f"Remote session {session_id} "
                            "is already accepted."
                        )

                        if debug:
                            print(
                                "[DEBUG] Session already accepted"
                            )

                    last_remote_session_id = session_id

                    if debug:
                        print(
                            f"[DEBUG] Last remote session ID updated: "
                            f"{last_remote_session_id}"
                        )

                # -------------------------
                # Start Screen Stream
                # -------------------------
                if session_status in ("ACCEPTED", "CONNECTING"):

                    print(
                        "Starting remote screen streamer..."
                    )

                    if debug:
                        print(
                            f"[DEBUG] Creating RemoteScreenStreamer "
                            f"for session {session_id}"
                        )

                    streamer = RemoteScreenStreamer(
                        BACKEND_URL,
                        session_id,
                        fps=5
                    )

                    if debug:
                        print("[DEBUG] Connecting streamer...")

                    streamer.connect()

                    print(
                        "Remote screen streamer connected."
                    )

                    if debug:
                        print(
                            "[DEBUG] Starting screen stream..."
                        )

                    streamer.stream()

                    if debug:
                        print(
                            "[DEBUG] Screen stream ended"
                        )

            else:

                if debug:
                    print(
                        "[DEBUG] No pending remote session"
                    )

        except Exception as e:

            print(
                f"Agent cycle failed: {e}"
            )

            if debug:
                print(
                    "[DEBUG] Exception type: "
                    f"{type(e).__name__}"
                )

        # -------------------------
        # Wait Before Next Cycle
        # -------------------------
        if debug:
            print(
                f"[DEBUG] Waiting {HEARTBEAT_INTERVAL} seconds "
                "before next cycle..."
            )

        time.sleep(HEARTBEAT_INTERVAL)


if __name__ == "__main__":
    main(debug=True)