import time
import threading

from techpilot_agent.communication.client import TechPilotClient
from techpilot_agent.identity.device_id import get_device_id
from techpilot_agent.telemetry.collector import collect_telemetry

from remote.stream import RemoteScreenStreamer
from remote.control import RemoteControlClient


BACKEND_URL = "http://192.168.0.69:8000"
HEARTBEAT_INTERVAL = 30


def start_remote_session(session_id, debug=False):

    print(
        f"[REMOTE] Starting remote session: {session_id}"
    )

    # -------------------------------------------------
    # SCREEN STREAM
    # -------------------------------------------------

    streamer = RemoteScreenStreamer(
        BACKEND_URL,
        session_id,
        fps=5
    )

    # -------------------------------------------------
    # CONTROL CHANNEL
    # -------------------------------------------------

    control_client = RemoteControlClient(
        BACKEND_URL,
        session_id
    )

    control_thread = threading.Thread(
        target=control_client.listen,
        daemon=True
    )

    control_thread.start()

    print(
        f"[CONTROL] Control listener started "
        f"for session {session_id}"
    )

    # -------------------------------------------------
    # SCREEN STREAM CONNECTION
    # -------------------------------------------------

    if streamer.connect():

        print(
            f"[REMOTE] Screen streamer connected "
            f"for session {session_id}"
        )

        # This blocks while streaming,
        # but the control listener continues
        # running in its own thread.

        try:

            streamer.stream()

        except Exception as e:

            print(
                f"[REMOTE] Stream failed: "
                f"{type(e).__name__}: {e}"
            )

    else:

        print(
            "[REMOTE] Could not connect screen streamer"
        )

    # -------------------------------------------------
    # CLEANUP
    # -------------------------------------------------

    control_client.close()
    streamer.close()

    print(
        f"[REMOTE] Remote session {session_id} ended"
    )


def main(debug=False):

    print("Starting TechPilot Agent...")

    if debug:

        print(
            "[DEBUG] Debug mode enabled"
        )

        print(
            f"[DEBUG] Backend URL: {BACKEND_URL}"
        )

        print(
            f"[DEBUG] Heartbeat interval: "
            f"{HEARTBEAT_INTERVAL}s"
        )

    # -------------------------------------------------
    # DEVICE IDENTITY
    # -------------------------------------------------

    device_id = get_device_id()

    print(
        f"Device ID: {device_id}"
    )

    # -------------------------------------------------
    # BACKEND CLIENT
    # -------------------------------------------------

    client = TechPilotClient(
        BACKEND_URL
    )

    print(
        "[DEBUG] Backend client initialized"
    )

    # -------------------------------------------------
    # INITIAL TELEMETRY
    # -------------------------------------------------

    telemetry = collect_telemetry()

    agent_data = {

        "device_id": device_id,

        "hostname": telemetry["hostname"],

        "operating_system":
            telemetry["operating_system"],

        "os_version":
            telemetry["os_version"],

        "agent_version": "0.1.0",
    }

    # -------------------------------------------------
    # REGISTER AGENT
    # -------------------------------------------------

    print(
        "Registering agent..."
    )

    registration = client.register_agent(
        agent_data
    )

    print(
        f"Registration response: "
        f"{registration}"
    )

    # -------------------------------------------------
    # REMOTE SESSION TRACKING
    # -------------------------------------------------

    last_remote_session_id = None

    # -------------------------------------------------
    # MAIN LOOP
    # -------------------------------------------------

    while True:

        try:

            if debug:

                print(
                    "\n[DEBUG] Starting new agent cycle"
                )

            # -------------------------------------------------
            # TELEMETRY
            # -------------------------------------------------

            telemetry = collect_telemetry()

            telemetry_data = {

                "device_id": device_id,

                "hostname":
                    telemetry["hostname"],

                "cpu_percent":
                    telemetry["cpu_percent"],

                "memory_percent":
                    telemetry["memory_percent"],

                "disk_percent":
                    telemetry["disk_percent"],
            }

            telemetry_response = (
                client.send_telemetry(
                    telemetry_data
                )
            )

            print(
                f"Telemetry sent: "
                f"{telemetry_response}"
            )

            # -------------------------------------------------
            # HEARTBEAT
            # -------------------------------------------------

            heartbeat = client.heartbeat(
                device_id
            )

            print(
                f"Heartbeat: {heartbeat}"
            )

            # -------------------------------------------------
            # CHECK REMOTE SESSION
            # -------------------------------------------------

            remote_session = (
                client.get_pending_remote_session(
                    device_id
                )
            )

            if debug:

                print(
                    f"[DEBUG] Remote session response: "
                    f"{remote_session}"
                )

            if not remote_session.get("pending"):

                if debug:

                    print(
                        "[DEBUG] No pending remote session"
                    )

                time.sleep(
                    HEARTBEAT_INTERVAL
                )

                continue

            # -------------------------------------------------
            # SESSION DETAILS
            # -------------------------------------------------

            session_id = remote_session.get(
                "session_id"
            )

            session_status = remote_session.get(
                "status"
            )

            print(
                f"[REMOTE] Session detected: "
                f"ID={session_id}, "
                f"Status={session_status}"
            )

            # -------------------------------------------------
            # PREVENT DUPLICATE SESSION START
            # -------------------------------------------------

            if session_id == last_remote_session_id:

                if debug:

                    print(
                        f"[DEBUG] Session {session_id} "
                        "already handled"
                    )

                time.sleep(
                    HEARTBEAT_INTERVAL
                )

                continue

            # -------------------------------------------------
            # ACCEPT REQUESTED SESSION
            # -------------------------------------------------

            if session_status == "REQUESTED":

                print(
                    f"[REMOTE] Accepting session "
                    f"{session_id}"
                )

                accepted_session = (
                    client.accept_remote_session(
                        session_id
                    )
                )

                print(
                    f"[REMOTE] Session accepted: "
                    f"{accepted_session}"
                )

                connected_session = (
                    client.connect_remote_session(
                        session_id
                    )
                )

                print(
                    f"[REMOTE] Session connecting: "
                    f"{connected_session}"
                )

                session_status = (
                    connected_session.get(
                        "session_status",
                        "CONNECTING"
                    )
                )

            # -------------------------------------------------
            # START REMOTE SESSION
            # -------------------------------------------------

            if session_status in (
                "ACCEPTED",
                "CONNECTING",
                "ACTIVE"
            ):

                print(
                    f"[REMOTE] Starting session "
                    f"{session_id}"
                )

                last_remote_session_id = (
                    session_id
                )

                # This function starts BOTH:
                #
                # 1. Screen streaming
                # 2. Control listener

                start_remote_session(
                    session_id,
                    debug=debug
                )

            else:

                print(
                    f"[REMOTE] Session {session_id} "
                    f"not ready. Status={session_status}"
                )

        except Exception as e:

            print(
                f"[ERROR] Agent cycle failed: "
                f"{type(e).__name__}: {e}"
            )

        # -------------------------------------------------
        # NEXT AGENT CYCLE
        # -------------------------------------------------

        if debug:

            print(
                f"[DEBUG] Waiting "
                f"{HEARTBEAT_INTERVAL} seconds..."
            )

        time.sleep(
            HEARTBEAT_INTERVAL
        )


if __name__ == "__main__":

    main(
        debug=True
    )