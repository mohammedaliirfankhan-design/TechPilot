import json
import time
import threading
import urllib.request
import urllib.error

from techpilot_agent.communication.client import TechPilotClient
from techpilot_agent.identity.device_id import get_device_id
from techpilot_agent.telemetry.collector import collect_telemetry

from remote.stream import RemoteScreenStreamer
from remote.control import RemoteControlClient


# =========================================================
# CONFIGURATION
# =========================================================

BACKEND_URL = "http://192.168.0.69:8000"

SESSION_CHECK_INTERVAL = 2
SESSION_STATUS_INTERVAL = 1
HEARTBEAT_INTERVAL = 30


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
        )

        with urllib.request.urlopen(
            request,
            timeout=5,
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

        if status is not None:

            print(
                f"[REMOTE] Session "
                f"{session_id} status: "
                f"{status}"
            )

        # -------------------------------------------------
        # SESSION ENDED
        # -------------------------------------------------

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

            # ---------------------------------------------
            # STOP SCREEN STREAM
            # ---------------------------------------------

            if streamer is not None:

                try:

                    streamer.close()

                except Exception as e:

                    print(
                        f"[REMOTE] Streamer shutdown "
                        f"error: {e}"
                    )

            # ---------------------------------------------
            # STOP CONTROL
            # ---------------------------------------------

            if control_client is not None:

                try:

                    control_client.close()

                except Exception as e:

                    print(
                        f"[CONTROL] Control shutdown "
                        f"error: {e}"
                    )

            break

        time.sleep(
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

        # -------------------------------------------------
        # NEVER START ENDED SESSION
        # -------------------------------------------------

        if current_status == "ENDED":

            print(
                f"[REMOTE] REFUSING to start "
                f"ENDED session {session_id}"
            )

            return False

        # -------------------------------------------------
        # SESSION MUST BE CONNECTING OR ACTIVE
        # -------------------------------------------------

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
        # SCREEN STREAMER
        # =================================================

        streamer = RemoteScreenStreamer(
            BACKEND_URL,
            session_id,
            fps=12,
        )

        # =================================================
        # SCREEN CONNECTION
        # =================================================

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

        print(
            f"[REMOTE] Screen stream connected "
            f"for session {session_id}"
        )

        # =================================================
        # CONTROL CLIENT
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
        # SCREEN STREAM
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

        # =================================================
        # STOP MONITOR
        # =================================================

        stop_event.set()

        # =================================================
        # CLOSE CONTROL
        # =================================================

        if control_client is not None:

            try:

                control_client.close()

            except Exception as e:

                print(
                    f"[CONTROL] Cleanup error "
                    f"for session {session_id}: {e}"
                )

        # =================================================
        # CLOSE STREAMER
        # =================================================

        if streamer is not None:

            try:

                streamer.close()

            except Exception as e:

                print(
                    f"[REMOTE] Stream cleanup error "
                    f"for session {session_id}: {e}"
                )

        # =================================================
        # WAIT CONTROL THREAD
        # =================================================

        if control_thread is not None:

            try:

                control_thread.join(
                    timeout=1
                )

            except Exception:

                pass

        # =================================================
        # WAIT MONITOR THREAD
        # =================================================

        if monitor_thread is not None:

            try:

                monitor_thread.join(
                    timeout=1
                )

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
            "[REMOTE] No remote session is currently owned "
            "by this agent."
        )

        print(
            "[REMOTE] Agent is ready for a NEW session."
        )

        print(
            "================================================="
        )

        print()


# =========================================================
# MAIN AGENT
# =========================================================

def main(
    debug: bool = False,
):

    print(
        "================================================="
    )

    print(
        "Starting TechPilot Agent..."
    )

    print(
        "================================================="
    )

    # =================================================
    # DEBUG
    # =================================================

    if debug:

        print(
            f"[DEBUG] Backend URL: "
            f"{BACKEND_URL}"
        )

        print(
            f"[DEBUG] Session check interval: "
            f"{SESSION_CHECK_INTERVAL}s"
        )

        print(
            f"[DEBUG] Session status interval: "
            f"{SESSION_STATUS_INTERVAL}s"
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
    # INITIAL TELEMETRY
    # =================================================

    telemetry = collect_telemetry()

    agent_data = {

        "device_id":
            device_id,

        "hostname":
            telemetry["hostname"],

        "operating_system":
            telemetry["operating_system"],

        "os_version":
            telemetry["os_version"],

        "agent_version":
            "0.1.0",
    }

    # =================================================
    # REGISTER AGENT
    # =================================================

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

    # =================================================
    # CURRENT SESSION OWNERSHIP
    # =================================================

    current_session_id = None

    # =================================================
    # MAIN LOOP
    # =================================================

    while True:

        try:

            # =================================================
            # TELEMETRY
            # =================================================

            telemetry = collect_telemetry()

            telemetry_data = {

                "device_id":
                    device_id,

                "hostname":
                    telemetry["hostname"],

                "cpu_percent":
                    telemetry["cpu_percent"],

                "memory_percent":
                    telemetry["memory_percent"],

                "disk_percent":
                    telemetry["disk_percent"],
            }

            client.send_telemetry(
                telemetry_data
            )

            # =================================================
            # HEARTBEAT
            # =================================================

            heartbeat = client.heartbeat(
                device_id
            )

            if debug:

                print(
                    f"[DEBUG] Heartbeat: "
                    f"{heartbeat}"
                )

            # =================================================
            # SAFETY:
            # NEVER POLL FOR A NEW SESSION WHILE ONE IS ACTIVE
            # =================================================

            if current_session_id is not None:

                current_status = get_session_status(
                    current_session_id
                )

                if debug:

                    print(
                        f"[DEBUG] Owned session "
                        f"{current_session_id}: "
                        f"{current_status}"
                    )

                # -------------------------------------------------
                # STILL ACTIVE
                # -------------------------------------------------

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

                # -------------------------------------------------
                # ENDED / MISSING / INVALID
                # -------------------------------------------------

                print(
                    f"[REMOTE] Owned session "
                    f"{current_session_id} is no longer active."
                )

                print(
                    f"[REMOTE] Releasing session "
                    f"{current_session_id}"
                )

                current_session_id = None

                time.sleep(1)

                continue

            # =================================================
            # CHECK FOR NEW SESSION
            # =================================================

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

            # =================================================
            # NO SESSION
            # =================================================

            if not remote_session.get(
                "pending",
                False,
            ):

                time.sleep(
                    SESSION_CHECK_INTERVAL
                )

                continue

            # =================================================
            # SESSION DETAILS
            # =================================================

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

            # =================================================
            # CLAIM SESSION
            # =================================================

            current_session_id = session_id

            print(
                f"[REMOTE] Agent now owns session "
                f"{current_session_id}"
            )

            # =================================================
            # VERIFY DIRECTLY AGAINST BACKEND
            # =================================================

            actual_status = get_session_status(
                session_id
            )

            print(
                f"[REMOTE] Backend confirms session "
                f"{session_id}: {actual_status}"
            )

            # =================================================
            # SESSION DISAPPEARED / ENDED
            # =================================================

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

            # =================================================
            # REQUESTED → ACCEPT
            # =================================================

            if actual_status == "REQUESTED":

                print(
                    f"[REMOTE] Accepting session "
                    f"{session_id}"
                )

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

                # -------------------------------------------------
                # VERIFY ACCEPTED STATE
                # -------------------------------------------------

                actual_status = get_session_status(
                    session_id
                )

                print(
                    f"[REMOTE] Session {session_id} "
                    f"after accept: {actual_status}"
                )

                if actual_status == "ENDED":

                    print(
                        f"[REMOTE] Session "
                        f"{session_id} ended during accept."
                    )

                    current_session_id = None

                    continue

                if actual_status != "ACCEPTED":

                    print(
                        f"[REMOTE] Unexpected state "
                        f"for session {session_id}: "
                        f"{actual_status}"
                    )

                    current_session_id = None

                    continue

                # -------------------------------------------------
                # ACCEPTED → CONNECTING
                # -------------------------------------------------

                print(
                    f"[REMOTE] Connecting session "
                    f"{session_id}"
                )

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

            # =================================================
            # FINAL STATE CHECK BEFORE STARTING
            # =================================================

            actual_status = get_session_status(
                session_id
            )

            print(
                f"[REMOTE] Final startup check "
                f"for session {session_id}: "
                f"{actual_status}"
            )

            if actual_status == "ENDED":

                print(
                    f"[REMOTE] REFUSING to start "
                    f"ENDED session {session_id}"
                )

                current_session_id = None

                continue

            if actual_status not in (
                "CONNECTING",
                "ACTIVE",
            ):

                print(
                    f"[REMOTE] Session {session_id} "
                    f"is not ready for remote startup."
                )

                print(
                    f"[REMOTE] Current status: "
                    f"{actual_status}"
                )

                current_session_id = None

                time.sleep(1)

                continue

            # =================================================
            # START REMOTE SESSION
            # =================================================

            print(
                f"[REMOTE] Launching remote session "
                f"{session_id}"
            )

            start_remote_session(
                session_id,
                debug=debug,
            )

            # =================================================
            # SESSION FULLY FINISHED
            # =================================================

            print(
                f"[REMOTE] Session "
                f"{session_id} is COMPLETELY FINISHED."
            )

            print(
                f"[REMOTE] Releasing ownership of "
                f"session {session_id}"
            )

            current_session_id = None

            print(
                "[REMOTE] Returning to clean "
                "session polling."
            )

            time.sleep(1)

        except Exception as e:

            print(
                f"[ERROR] Agent cycle failed: "
                f"{type(e).__name__}: {e}"
            )

            if debug:

                import traceback

                traceback.print_exc()

            # -------------------------------------------------
            # If an unexpected exception happens while owning
            # a session, verify whether it is actually dead.
            # -------------------------------------------------

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

        # =================================================
        # NEXT POLL
        # =================================================

        time.sleep(
            SESSION_CHECK_INTERVAL
        )


# =========================================================
# ENTRY POINT
# =========================================================

if __name__ == "__main__":

    main(
        debug=True
    )