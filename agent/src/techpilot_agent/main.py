import json
import time
import threading
import urllib.request
import urllib.error

from techpilot_agent.communication.client import TechPilotClient
from techpilot_agent.config import BACKEND_URL, AGENT_TOKEN
from techpilot_agent.identity.device_id import get_device_id
from techpilot_agent.logging_config import configure_logging
from techpilot_agent.telemetry.collector import collect_telemetry
from techpilot_agent.shell.worker import ShellWorker
from techpilot_agent.runtime_guard import (
    prepare_runtime,
    wait_for_backend,
    run_forever,
)

from techpilot_agent.network.collector import collect_network_telemetry
from techpilot_agent.network.firewall import collect_firewall_posture

from remote.stream import RemoteScreenStreamer
from remote.control import RemoteControlClient


# =========================================================
# CONFIGURATION
# =========================================================

SESSION_CHECK_INTERVAL = 2
SESSION_STATUS_INTERVAL = 1
HEARTBEAT_INTERVAL = 30
NETWORK_TELEMETRY_INTERVAL = 60
AGENT_VERSION = "1.2.0"

# Upper limit only. The stream is paced by the viewer's frame
# acknowledgements, so a slow network lowers the real frame rate
# automatically instead of building up delay.
REMOTE_MAX_FPS = 20


# =========================================================
# SESSION STATUS
# =========================================================

def get_session_status(session_id: int):

    url = (
        f"{BACKEND_URL}"
        f"/api/v1/remote/sessions/"
        f"{session_id}"
    )

    try:

        request = urllib.request.Request(
            url,
            method="GET",
            headers={
                "Authorization": f"Bearer {AGENT_TOKEN}",
            },
        )

        with urllib.request.urlopen(
            request,
            timeout=8,
        ) as response:

            data = json.loads(
                response.read().decode("utf-8")
            )

        return data.get("status")

    except urllib.error.HTTPError as e:

        print(
            f"[REMOTE] Session {session_id} "
            f"status check failed: HTTP {e.code}"
        )

        return None

    except Exception as e:

        print(
            f"[REMOTE] Session {session_id} "
            f"status check error: {e}"
        )

        return None


# =========================================================
# SESSION END MONITOR
# =========================================================

def monitor_session_end(
    session_id: int,
    streamer,
    control_client,
    stop_event,
):

    print(
        f"[REMOTE] Session monitor started "
        f"for session {session_id}"
    )

    while not stop_event.is_set():

        status = get_session_status(
            session_id
        )

        if status == "ENDED":

            print(
                "================================================="
            )
            print(
                f"[REMOTE] Session {session_id} "
                f"HAS BEEN ENDED"
            )
            print(
                "[REMOTE] Stopping all remote components..."
            )
            print(
                "================================================="
            )

            stop_event.set()

            if streamer is not None:
                try:
                    streamer.close()
                except Exception as e:
                    print(
                        f"[REMOTE] Streamer shutdown "
                        f"error: {e}"
                    )

            if control_client is not None:
                try:
                    control_client.close()
                except Exception as e:
                    print(
                        f"[CONTROL] Control shutdown "
                        f"error: {e}"
                    )

            break

        # Wait, but wake up immediately if the session is
        # cleaned up from elsewhere.
        stop_event.wait(
            SESSION_STATUS_INTERVAL
        )

    print(
        f"[REMOTE] Session monitor stopped "
        f"for session {session_id}"
    )


# =========================================================
# START ONE REMOTE SESSION
# =========================================================

def start_remote_session(
    session_id: int,
    debug: bool = False,
):

    print()
    print(
        "================================================="
    )
    print(
        f"[REMOTE] STARTING REMOTE SESSION {session_id}"
    )
    print(
        "================================================="
    )

    streamer = None
    control_client = None

    control_thread = None
    monitor_thread = None

    stop_event = threading.Event()

    try:

        # =================================================
        # FINAL SESSION VALIDATION
        # =================================================

        current_status = get_session_status(
            session_id
        )

        print(
            f"[REMOTE] Initial status for session "
            f"{session_id}: {current_status}"
        )

        if current_status == "ENDED":

            print(
                f"[REMOTE] REFUSING to start "
                f"ENDED session {session_id}"
            )

            return False

        if current_status not in (
            "CONNECTING",
            "ACTIVE",
        ):

            print(
                f"[REMOTE] Session {session_id} "
                f"is not ready. "
                f"Current status: {current_status}"
            )

            return False

        # =================================================
        # CONTROL CLIENT FIRST
        #
        # The control channel also carries the viewer's
        # frame acknowledgements, so start it before the
        # screen stream.
        # =================================================

        control_client = RemoteControlClient(
            BACKEND_URL,
            session_id,
        )

        control_thread = threading.Thread(
            target=control_client.listen,
            daemon=True,
            name=f"remote-control-{session_id}",
        )

        control_thread.start()

        print(
            f"[CONTROL] Control listener started "
            f"for session {session_id}"
        )

        # =================================================
        # SCREEN STREAMER
        # =================================================

        streamer = RemoteScreenStreamer(
            BACKEND_URL,
            session_id,
            fps=REMOTE_MAX_FPS,
        )

        print(
            f"[REMOTE] Connecting screen stream "
            f"for session {session_id}..."
        )

        if not streamer.connect():

            print(
                f"[REMOTE] Screen stream connection "
                f"failed for session {session_id}"
            )

            return False

        # =================================================
        # SESSION MONITOR
        # =================================================

        monitor_thread = threading.Thread(
            target=monitor_session_end,
            args=(
                session_id,
                streamer,
                control_client,
                stop_event,
            ),
            daemon=True,
            name=f"session-monitor-{session_id}",
        )

        monitor_thread.start()

        # =================================================
        # SCREEN STREAM (blocks until the session ends)
        # =================================================

        print(
            f"[REMOTE] Starting screen stream "
            f"for session {session_id}"
        )

        streamer.stream()

        return True

    except Exception as e:

        print(
            f"[REMOTE] Session {session_id} "
            f"failed: "
            f"{type(e).__name__}: {e}"
        )

        if debug:
            import traceback
            traceback.print_exc()

        return False

    finally:

        print()
        print(
            f"[REMOTE] Cleaning up session "
            f"{session_id}..."
        )

        stop_event.set()

        if control_client is not None:
            try:
                control_client.close()
            except Exception as e:
                print(
                    f"[CONTROL] Cleanup error "
                    f"for session {session_id}: {e}"
                )

        if streamer is not None:
            try:
                streamer.close()
            except Exception as e:
                print(
                    f"[REMOTE] Stream cleanup error "
                    f"for session {session_id}: {e}"
                )

        for thread in (control_thread, monitor_thread):
            if thread is not None:
                try:
                    thread.join(timeout=2)
                except Exception:
                    pass

        print(
            "================================================="
        )
        print(
            f"[REMOTE] SESSION {session_id} "
            f"FULLY CLEANED UP"
        )
        print(
            "[REMOTE] Agent is ready for a NEW session."
        )
        print(
            "================================================="
        )
        print()


# =========================================================
# REGISTRATION WITH RETRY
# =========================================================

def register_with_retry(
    client: TechPilotClient,
    agent_data: dict,
    logger,
):
    """
    Keep trying to register until the backend accepts it.

    Before this, one failed request at boot (Wi-Fi not yet
    connected, Render instance still waking up) crashed the
    whole agent.
    """

    delay = 5

    while True:

        try:

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

            return registration

        except Exception as e:

            message = (
                f"[AGENT] Registration failed "
                f"({type(e).__name__}: {e}). "
                f"Retrying in {delay}s..."
            )

            print(message)
            logger.warning(message)

            time.sleep(delay)

            delay = min(delay * 2, 60)


# =========================================================
# MAIN AGENT
# =========================================================

def main(
    debug: bool = False,
):

    logger = configure_logging()

    logger.info(
        "TechAIPILOT agent starting."
    )

    print(
        "================================================="
    )
    print(
        "Starting TechPilot Agent..."
    )
    print(
        "================================================="
    )

    if debug:

        print(
            f"[DEBUG] Backend URL: "
            f"{BACKEND_URL}"
        )

    # =================================================
    # DEVICE ID
    # =================================================

    device_id = get_device_id()

    print(
        f"Device ID: {device_id}"
    )

    # =================================================
    # BACKEND CLIENT
    # =================================================

    client = TechPilotClient(
        BACKEND_URL
    )

    print(
        "[DEBUG] Backend client initialized"
    )

    # =================================================
    # REGISTER AGENT (retries until it succeeds)
    # =================================================

    telemetry = collect_telemetry()

    agent_data = {
        "device_id": device_id,
        "hostname": telemetry["hostname"],
        "operating_system": telemetry["operating_system"],
        "os_version": telemetry["os_version"],
        "agent_version": AGENT_VERSION,
    }

    register_with_retry(
        client,
        agent_data,
        logger,
    )

    # =================================================
    # SHELL WORKER
    #
    # Started only after registration succeeded, and
    # stopped in "finally" so a restart of main() by
    # run_forever() never leaves two shell workers running
    # (which would execute every command twice).
    # =================================================

    shell_worker = ShellWorker(
        client,
        device_id,
    )

    shell_worker.start()

    print(
        "[SHELL] Shell worker started."
    )

    current_session_id = None

    last_network_telemetry = 0.0

    try:

        # =================================================
        # MAIN LOOP
        # =================================================

        while True:

            try:

                # ---------------- TELEMETRY ----------------

                telemetry = collect_telemetry()

                telemetry_data = {
                    "device_id": device_id,
                    "hostname": telemetry["hostname"],
                    "cpu_percent": telemetry["cpu_percent"],
                    "memory_percent": telemetry["memory_percent"],
                    "disk_percent": telemetry["disk_percent"],
                }

                client.send_telemetry(
                    telemetry_data
                )

                # ---------------- HEARTBEAT ----------------

                heartbeat = client.heartbeat(
                    device_id
                )

                if debug:
                    print(
                        f"[DEBUG] Heartbeat: "
                        f"{heartbeat}"
                    )

                # ---------- NETWORK SECURITY TELEMETRY ----------

                now = time.monotonic()

                if (
                    current_session_id is None
                    and now - last_network_telemetry
                    >= NETWORK_TELEMETRY_INTERVAL
                ):
                    try:
                        network_data = collect_network_telemetry()
                        network_data["firewall"] = (
                            collect_firewall_posture()
                        )

                        network_response = (
                            client.send_network_telemetry(
                                network_data
                            )
                        )

                        last_network_telemetry = now

                        if debug:
                            print(
                                "[NETWORK] Telemetry accepted: "
                                f"{network_response}"
                            )

                    except Exception as e:
                        print(
                            "[NETWORK] Telemetry cycle failed: "
                            f"{type(e).__name__}: {e}"
                        )

                # ------ NEVER POLL WHILE A SESSION IS OWNED ------

                if current_session_id is not None:

                    current_status = get_session_status(
                        current_session_id
                    )

                    if current_status in (
                        "REQUESTED",
                        "ACCEPTED",
                        "CONNECTING",
                        "ACTIVE",
                    ):
                        time.sleep(
                            SESSION_CHECK_INTERVAL
                        )
                        continue

                    print(
                        f"[REMOTE] Releasing session "
                        f"{current_session_id} (no longer active)"
                    )

                    current_session_id = None

                    time.sleep(1)

                    continue

                # ------------- CHECK FOR NEW SESSION -------------

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

                if not remote_session.get(
                    "pending",
                    False,
                ):
                    time.sleep(
                        SESSION_CHECK_INTERVAL
                    )
                    continue

                session_id = remote_session.get(
                    "session_id"
                )

                session_status = remote_session.get(
                    "status"
                )

                if session_id is None:
                    print(
                        "[REMOTE] Invalid session response."
                    )
                    time.sleep(
                        SESSION_CHECK_INTERVAL
                    )
                    continue

                print(
                    f"[REMOTE] NEW SESSION DETECTED: "
                    f"ID={session_id}, "
                    f"Status={session_status}"
                )

                current_session_id = session_id

                actual_status = get_session_status(
                    session_id
                )

                print(
                    f"[REMOTE] Backend confirms session "
                    f"{session_id}: {actual_status}"
                )

                if actual_status in (
                    None,
                    "ENDED",
                ):
                    print(
                        f"[REMOTE] Session {session_id} "
                        f"is invalid or already ended."
                    )
                    current_session_id = None
                    time.sleep(1)
                    continue

                # ------------- REQUESTED -> ACCEPT -------------

                if actual_status == "REQUESTED":

                    try:
                        accepted_session = (
                            client.accept_remote_session(
                                session_id
                            )
                        )
                    except Exception as e:
                        print(
                            f"[REMOTE] Failed to accept "
                            f"session {session_id}: "
                            f"{type(e).__name__}: {e}"
                        )
                        current_session_id = None
                        time.sleep(1)
                        continue

                    print(
                        f"[REMOTE] Session accepted: "
                        f"{accepted_session}"
                    )

                    actual_status = get_session_status(
                        session_id
                    )

                    if actual_status != "ACCEPTED":
                        print(
                            f"[REMOTE] Unexpected state "
                            f"for session {session_id}: "
                            f"{actual_status}"
                        )
                        current_session_id = None
                        continue

                    # --------- ACCEPTED -> CONNECTING ---------

                    try:
                        connected_session = (
                            client.connect_remote_session(
                                session_id
                            )
                        )
                    except Exception as e:
                        print(
                            f"[REMOTE] Failed to connect "
                            f"session {session_id}: "
                            f"{type(e).__name__}: {e}"
                        )
                        current_session_id = None
                        time.sleep(1)
                        continue

                    print(
                        f"[REMOTE] Session connecting: "
                        f"{connected_session}"
                    )

                # --------- FINAL STATE CHECK BEFORE START ---------

                actual_status = get_session_status(
                    session_id
                )

                if actual_status not in (
                    "CONNECTING",
                    "ACTIVE",
                ):
                    print(
                        f"[REMOTE] Session {session_id} "
                        f"is not ready (status: {actual_status})."
                    )
                    current_session_id = None
                    time.sleep(1)
                    continue

                # ------------- START REMOTE SESSION -------------

                print(
                    f"[REMOTE] Launching remote session "
                    f"{session_id}"
                )

                start_remote_session(
                    session_id,
                    debug=debug,
                )

                print(
                    f"[REMOTE] Session {session_id} finished. "
                    f"Returning to session polling."
                )

                current_session_id = None

                time.sleep(1)

            except Exception as e:

                print(
                    f"[ERROR] Agent cycle failed: "
                    f"{type(e).__name__}: {e}"
                )

                if debug:
                    import traceback
                    traceback.print_exc()

                if current_session_id is not None:

                    status = get_session_status(
                        current_session_id
                    )

                    if status in (
                        None,
                        "ENDED",
                    ):
                        print(
                            f"[REMOTE] Releasing invalid "
                            f"session {current_session_id}"
                        )
                        current_session_id = None

            time.sleep(
                SESSION_CHECK_INTERVAL
            )

    finally:

        try:
            shell_worker.stop()
        except Exception:
            pass


# =========================================================
# ENTRY POINT
# =========================================================

if __name__ == "__main__":

    # One instance only, no QuickEdit freezes, safe output
    # streams for windowed builds.
    prepare_runtime()

    # Wait for the network and for a sleeping Render backend
    # to wake up, instead of crashing at boot.
    wait_for_backend(BACKEND_URL)

    # Restart the agent loop automatically if anything
    # unexpected ever escapes it.
    run_forever(main)
