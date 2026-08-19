import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  KeyboardEvent,
  MouseEvent,
  WheelEvent,
} from "react";

import ScrollReveal from "../components/ScrollReveal";

import {
  createRemoteSession,
  disconnectRemoteSession,
  getAgents,
  getPendingRemoteSession,
  getRemoteControlUrl,
  getRemoteStreamUrl,
  type Agent,
} from "../api";


/* =========================================================
   TYPES
   ========================================================= */

type DeviceDetailsProps = {
  deviceId: string;
  onBack: () => void;
};


type RemoteStatus =
  | "idle"
  | "connecting"
  | "live"
  | "error";


type ResourceType =
  | "cpu"
  | "ram"
  | "disk"
  | null;


type RemoteCommand =
  | {
      type: "mouse_move";
      x: number;
      y: number;
    }
  | {
      type: "mouse_click";
      x: number;
      y: number;
      button:
        | "left"
        | "right"
        | "middle";
      clicks: number;
    }
  | {
      type: "mouse_down";
      button:
        | "left"
        | "right"
        | "middle";
    }
  | {
      type: "mouse_up";
      button:
        | "left"
        | "right"
        | "middle";
    }
  | {
      type: "scroll";
      amount: number;
    }
  | {
      type: "key_press";
      key: string;
    }
  | {
      type: "type_text";
      text: string;
    }
  | {
      type: "hotkey";
      keys: string[];
    };


/* =========================================================
   SMALL UI COMPONENTS
   ========================================================= */

function StatusBadge({
  value,
}: {
  value: string;
}) {

  const normalized =
    value.toLowerCase();

  return (
    <span
      className={`status-badge status-${normalized}`}
    >
      <span className="status-dot" />

      {value}
    </span>
  );
}


function DetailItem({
  label,
  value,
}: {
  label: string;
  value:
    | string
    | number
    | null
    | undefined;
}) {

  return (
    <div className="detail-item">

      <span className="detail-label">
        {label}
      </span>

      <strong className="detail-value">
        {value ?? "Not reported"}
      </strong>

    </div>
  );
}


/* =========================================================
   DEVICE DETAILS
   ========================================================= */

function DeviceDetails({
  deviceId,
  onBack,
}: DeviceDetailsProps) {

  /* =======================================================
     DEVICE STATE
     ======================================================= */

  const [device, setDevice] =
    useState<Agent | null>(null);

  const [deviceLoading, setDeviceLoading] =
    useState(true);


  /* =======================================================
     RESOURCE STATE
     ======================================================= */

  const [
    activeResource,
    setActiveResource,
  ] = useState<ResourceType>(null);


  /* =======================================================
     REMOTE SESSION STATE
     ======================================================= */

  const [
    remoteSessionId,
    setRemoteSessionId,
  ] = useState<number | null>(null);

  const [
    remoteStatus,
    setRemoteStatus,
  ] = useState<RemoteStatus>("idle");

  const [
    remoteFrame,
    setRemoteFrame,
  ] = useState<string | null>(null);

  const [
    remoteError,
    setRemoteError,
  ] = useState<string | null>(null);

  const [
    recoveringSession,
    setRecoveringSession,
  ] = useState(true);


  /* =======================================================
     WEBSOCKET REFERENCES
     ======================================================= */

  const streamSocketRef =
    useRef<WebSocket | null>(null);

  const controlSocketRef =
    useRef<WebSocket | null>(null);

  const remoteScreenRef =
    useRef<HTMLDivElement | null>(null);


  /* =======================================================
     LOAD REAL DEVICE FROM BACKEND
     ======================================================= */

  useEffect(() => {

    let cancelled = false;

    async function loadDevice() {

      try {

        setDeviceLoading(true);

        const agents =
          await getAgents();

        console.log(
          "[DEVICE] Available agents:",
          agents,
        );

        console.log(
          "[DEVICE] Looking for device:",
          deviceId,
        );

        const matchedAgent =
          agents.find(
            (agent) =>
              agent.device_id ===
              deviceId,
          );

        console.log(
          "[DEVICE] Matched agent:",
          matchedAgent,
        );

        if (!cancelled) {

          setDevice(
            matchedAgent ?? null,
          );
        }

      } catch (error) {

        console.error(
          "[DEVICE] Failed to load agent:",
          error,
        );

        if (!cancelled) {

          setDevice(null);
        }

      } finally {

        if (!cancelled) {

          setDeviceLoading(false);
        }
      }
    }

    loadDevice();

    return () => {

      cancelled = true;
    };

  }, [deviceId]);


  /* =======================================================
     RECOVER EXISTING REMOTE SESSION
     
     IMPORTANT:
     This runs whenever the device page is opened.
     
     If the browser was refreshed while a session was
     already active, we recover that session instead of
     creating a new one.
     ======================================================= */

  useEffect(() => {

    let cancelled = false;

    async function recoverRemoteSession() {

      try {

        setRecoveringSession(true);

        console.log(
          "[REMOTE] Checking for existing session:",
          deviceId,
        );

        const existingSession =
          await getPendingRemoteSession(
            deviceId,
          );

        console.log(
          "[REMOTE] Existing session response:",
          existingSession,
        );

        if (
          cancelled
        ) {
          return;
        }

        if (
          existingSession.pending &&
          existingSession.session_id
        ) {

          console.log(
            `[REMOTE] Recovering session #${existingSession.session_id}`,
          );

          setRemoteSessionId(
            existingSession.session_id,
          );

          setRemoteError(null);

          setRemoteStatus(
            "connecting",
          );

        } else {

          console.log(
            "[REMOTE] No existing remote session.",
          );

          setRemoteSessionId(null);

          setRemoteStatus("idle");

        }

      } catch (error) {

        console.error(
          "[REMOTE] Failed to recover existing session:",
          error,
        );

      } finally {

        if (!cancelled) {

          setRecoveringSession(false);
        }
      }
    }

    recoverRemoteSession();

    return () => {

      cancelled = true;
    };

  }, [deviceId]);


  /* =======================================================
     HEALTH SCORE
     ======================================================= */

  const healthScore =
    device ? 100 : 0;


  /* =======================================================
     SEND REMOTE COMMAND
     ======================================================= */

  const sendRemoteCommand = (
    command: RemoteCommand,
  ) => {

    const socket =
      controlSocketRef.current;

    if (
      !socket ||
      socket.readyState !==
        WebSocket.OPEN
    ) {

      console.warn(
        "[CONTROL] Control WebSocket is not connected.",
      );

      return;
    }

    try {

      socket.send(
        JSON.stringify(command),
      );

    } catch (error) {

      console.error(
        "[CONTROL] Failed to send command:",
        error,
      );
    }
  };


  /* =======================================================
     REMOTE COORDINATE CONVERSION
     ======================================================= */

  const getRemoteCoordinates = (
    event:
      | MouseEvent<HTMLImageElement>
      | MouseEvent<HTMLDivElement>,
  ) => {

    const image =
      event.currentTarget instanceof
      HTMLImageElement
        ? event.currentTarget
        : event.currentTarget.querySelector(
            ".remote-screen-image",
          ) as HTMLImageElement | null;

    if (!image) {
      return null;
    }

    const rect =
      image.getBoundingClientRect();

    const imageWidth =
      image.naturalWidth;

    const imageHeight =
      image.naturalHeight;

    if (
      !imageWidth ||
      !imageHeight ||
      !rect.width ||
      !rect.height
    ) {

      return null;
    }

    const scaleX =
      imageWidth / rect.width;

    const scaleY =
      imageHeight / rect.height;

    let x =
      Math.round(
        (event.clientX -
          rect.left) *
          scaleX,
      );

    let y =
      Math.round(
        (event.clientY -
          rect.top) *
          scaleY,
      );

    x = Math.max(
      0,
      Math.min(
        x,
        imageWidth - 1,
      ),
    );

    y = Math.max(
      0,
      Math.min(
        y,
        imageHeight - 1,
      ),
    );

    return {
      x,
      y,
    };
  };


  /* =======================================================
     MOUSE MOVE
     ======================================================= */

  const handleRemoteMouseMove = (
    event: MouseEvent<HTMLImageElement>,
  ) => {

    if (
      remoteStatus !== "live"
    ) {
      return;
    }

    const coordinates =
      getRemoteCoordinates(event);

    if (!coordinates) {
      return;
    }

    sendRemoteCommand({
      type: "mouse_move",
      x: coordinates.x,
      y: coordinates.y,
    });
  };


  /* =======================================================
     LEFT CLICK
     ======================================================= */

  const handleRemoteClick = (
    event: MouseEvent<HTMLImageElement>,
  ) => {

    event.preventDefault();

    if (
      remoteStatus !== "live"
    ) {
      return;
    }

    const coordinates =
      getRemoteCoordinates(event);

    if (!coordinates) {
      return;
    }

    sendRemoteCommand({
      type: "mouse_click",
      x: coordinates.x,
      y: coordinates.y,
      button: "left",
      clicks: 1,
    });

    remoteScreenRef.current?.focus();
  };


  /* =======================================================
     DOUBLE CLICK
     ======================================================= */

  const handleRemoteDoubleClick = (
    event: MouseEvent<HTMLImageElement>,
  ) => {

    event.preventDefault();

    if (
      remoteStatus !== "live"
    ) {
      return;
    }

    const coordinates =
      getRemoteCoordinates(event);

    if (!coordinates) {
      return;
    }

    sendRemoteCommand({
      type: "mouse_click",
      x: coordinates.x,
      y: coordinates.y,
      button: "left",
      clicks: 2,
    });

    remoteScreenRef.current?.focus();
  };


  /* =======================================================
     RIGHT CLICK
     ======================================================= */

  const handleRemoteContextMenu = (
    event: MouseEvent<HTMLImageElement>,
  ) => {

    event.preventDefault();

    if (
      remoteStatus !== "live"
    ) {
      return;
    }

    const coordinates =
      getRemoteCoordinates(event);

    if (!coordinates) {
      return;
    }

    sendRemoteCommand({
      type: "mouse_click",
      x: coordinates.x,
      y: coordinates.y,
      button: "right",
      clicks: 1,
    });

    remoteScreenRef.current?.focus();
  };


  /* =======================================================
     MOUSE WHEEL
     ======================================================= */

  const handleRemoteWheel = (
    event: WheelEvent<HTMLDivElement>,
  ) => {

    if (
      remoteStatus !== "live"
    ) {
      return;
    }

    event.preventDefault();

    const amount =
      event.deltaY > 0
        ? -3
        : 3;

    sendRemoteCommand({
      type: "scroll",
      amount,
    });
  };


  /* =======================================================
     KEYBOARD CONTROL
     ======================================================= */

  const handleRemoteKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {

    if (
      remoteStatus !== "live"
    ) {
      return;
    }

    event.preventDefault();

    if (event.repeat) {
      return;
    }

    const modifierKeys: string[] =
      [];

    if (event.ctrlKey) {
      modifierKeys.push("ctrl");
    }

    if (event.altKey) {
      modifierKeys.push("alt");
    }

    if (event.shiftKey) {
      modifierKeys.push("shift");
    }

    if (event.metaKey) {
      modifierKeys.push("win");
    }

    if (
      modifierKeys.length > 0
    ) {

      sendRemoteCommand({
        type: "hotkey",
        keys: [
          ...modifierKeys,
          event.key.toLowerCase(),
        ],
      });

      return;
    }

    sendRemoteCommand({
      type: "key_press",
      key: event.key.toLowerCase(),
    });
  };


  /* =======================================================
     START REMOTE VIEW
     ======================================================= */

  const startRemoteView = async () => {

    if (!device) {

      setRemoteStatus("error");

      setRemoteError(
        "No active TechPilot agent is associated with this device.",
      );

      return;
    }

    try {

      setRemoteStatus("connecting");

      setRemoteError(null);

      console.log(
        "[REMOTE] Creating session for:",
        device.device_id,
      );

      const session =
        await createRemoteSession(
          device.device_id,
        );

      console.log(
        "[REMOTE] Session created:",
        session,
      );

      setRemoteSessionId(
        session.session_id,
      );

    } catch (error) {

      console.error(
        "[REMOTE] Failed to start session:",
        error,
      );

      /*
       * If another session already exists,
       * immediately try to recover it.
       */

      try {

        const existingSession =
          await getPendingRemoteSession(
            device.device_id,
          );

        if (
          existingSession.pending &&
          existingSession.session_id
        ) {

          console.log(
            `[REMOTE] Existing session recovered after start failure: #${existingSession.session_id}`,
          );

          setRemoteSessionId(
            existingSession.session_id,
          );

          setRemoteStatus(
            "connecting",
          );

          setRemoteError(null);

          return;
        }

      } catch (
        recoveryError
      ) {

        console.error(
          "[REMOTE] Session recovery after start failure failed:",
          recoveryError,
        );
      }

      setRemoteStatus("error");

      setRemoteError(
        error instanceof Error
          ? error.message
          : "Failed to start remote session.",
      );
    }
  };


  /* =======================================================
     STOP REMOTE VIEW
     ======================================================= */

  const stopRemoteView = async () => {

    const sessionId =
      remoteSessionId;

    if (!sessionId) {
      return;
    }

    try {

      await disconnectRemoteSession(
        sessionId,
      );

    } catch (error) {

      console.error(
        "[REMOTE] Failed to disconnect:",
        error,
      );

    } finally {

      if (
        streamSocketRef.current
      ) {

        streamSocketRef.current.close();

        streamSocketRef.current =
          null;
      }

      if (
        controlSocketRef.current
      ) {

        controlSocketRef.current.close();

        controlSocketRef.current =
          null;
      }

      setRemoteSessionId(null);

      setRemoteStatus("idle");

      setRemoteError(null);

      setRemoteFrame(
        (previous) => {

          if (previous) {

            URL.revokeObjectURL(
              previous,
            );
          }

          return null;
        },
      );
    }
  };


  /* =======================================================
     SCREEN STREAM WEBSOCKET
     ======================================================= */

  useEffect(() => {

    if (!remoteSessionId) {
      return;
    }

    let disposed = false;

    console.log(
      `[REMOTE] Opening viewer stream for session ${remoteSessionId}`,
    );

    const websocket =
      new WebSocket(
        getRemoteStreamUrl(
          remoteSessionId,
        ),
      );

    streamSocketRef.current =
      websocket;

    websocket.binaryType = "blob";

    websocket.onopen = () => {

      console.log(
        `[REMOTE] Viewer connected for session ${remoteSessionId}`,
      );

      if (!disposed) {

        setRemoteStatus(
          "connecting",
        );
      }
    };

    websocket.onmessage = (
      event,
    ) => {

      if (
        !(event.data instanceof Blob)
      ) {
        return;
      }

      const imageUrl =
        URL.createObjectURL(
          event.data,
        );

      setRemoteFrame(
        (previous) => {

          if (previous) {

            URL.revokeObjectURL(
              previous,
            );
          }

          return imageUrl;
        },
      );

      if (!disposed) {

        setRemoteStatus("live");

        setRemoteError(null);
      }
    };

    websocket.onerror = (
      event,
    ) => {

      console.error(
        "[REMOTE] Viewer WebSocket error:",
        event,
      );

      if (!disposed) {

        setRemoteStatus("error");

        setRemoteError(
          "Remote screen connection failed.",
        );
      }
    };

    websocket.onclose = () => {

      console.log(
        `[REMOTE] Viewer disconnected for session ${remoteSessionId}`,
      );

      if (!disposed) {

        setRemoteStatus("error");

        setRemoteError(
          "Remote screen connection closed.",
        );
      }
    };

    return () => {

      disposed = true;

      websocket.close();

      if (
        streamSocketRef.current ===
        websocket
      ) {

        streamSocketRef.current =
          null;
      }
    };

  }, [remoteSessionId]);


  /* =======================================================
     CONTROL WEBSOCKET
     ======================================================= */

  useEffect(() => {

    if (!remoteSessionId) {
      return;
    }

    const controlUrl =
      getRemoteControlUrl(
        remoteSessionId,
      );

    console.log(
      `[CONTROL] Connecting viewer control to ${controlUrl}`,
    );

    const websocket =
      new WebSocket(
        controlUrl,
      );

    controlSocketRef.current =
      websocket;

    websocket.onopen = () => {

      console.log(
        `[CONTROL] Viewer control connected for session ${remoteSessionId}`,
      );
    };

    websocket.onerror = (
      event,
    ) => {

      console.error(
        "[CONTROL] Viewer control WebSocket error:",
        event,
      );

      /*
       * Do not destroy the screen session
       * just because the control socket
       * has a temporary problem.
       */

      setRemoteError(
        "Remote screen is live, but the control channel is unavailable.",
      );
    };

    websocket.onclose = () => {

      console.log(
        `[CONTROL] Viewer control disconnected for session ${remoteSessionId}`,
      );
    };

    return () => {

      websocket.close();

      if (
        controlSocketRef.current ===
        websocket
      ) {

        controlSocketRef.current =
          null;
      }
    };

  }, [remoteSessionId]);


  /* =======================================================
     CLEANUP WHEN LEAVING PAGE
     ======================================================= */

  useEffect(() => {

    return () => {

      if (
        streamSocketRef.current
      ) {

        streamSocketRef.current.close();

        streamSocketRef.current =
          null;
      }

      if (
        controlSocketRef.current
      ) {

        controlSocketRef.current.close();

        controlSocketRef.current =
          null;
      }

      setRemoteFrame(
        (previous) => {

          if (previous) {

            URL.revokeObjectURL(
              previous,
            );
          }

          return null;
        },
      );
    };

  }, []);


  /* =======================================================
     DEVICE LOADING
     ======================================================= */

  if (deviceLoading) {

    return (
      <section className="glass-card device-details-empty futuristic-empty-state">

        <div className="empty-icon">
          ◌
        </div>

        <strong>
          Loading device...
        </strong>

        <p>
          Loading TechPilot endpoint
          information.
        </p>

      </section>
    );
  }


  /* =======================================================
     DEVICE NOT FOUND
     ======================================================= */

  if (!device) {

    return (
      <section className="glass-card device-details-empty futuristic-empty-state">

        <div className="empty-icon">
          ⌕
        </div>

        <strong>
          Device not found
        </strong>

        <p>
          The selected device could not
          be found in the current TechPilot
          agent inventory.
        </p>

        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          ← Back to Devices
        </button>

      </section>
    );
  }


  /* =======================================================
     MAIN DEVICE DETAILS
     ======================================================= */

  return (
    <div className="device-details-layout futuristic-device-details device-details-scroll-experience">

      {/* ===================================================
          BACK BUTTON
          =================================================== */}

      <ScrollReveal delay={0}>

        <button
          type="button"
          className="back-button futuristic-back-button"
          onClick={onBack}
        >
          <span>←</span>
          Back to Devices
        </button>

      </ScrollReveal>


      {/* ===================================================
          DEVICE HEADER
          =================================================== */}

      <ScrollReveal delay={40}>

        <section className="glass-card device-details-header futuristic-device-header">

          <div className="device-header-main">

            <div>

              <span className="eyebrow">
                MANAGED ENDPOINT // DEVICE
              </span>

              <h2>
                {device.hostname}
              </h2>

              <p>
                {device.operating_system}
                {" · "}
                {device.os_version}
              </p>

              <div className="device-header-meta">

                <span>
                  DEVICE ID{" "}
                  {device.device_id}
                </span>

                <span>
                  AGENT{" "}
                  {device.agent_version}
                </span>

                <span>
                  REGISTERED{" "}
                  {device.registered_at}
                </span>

              </div>

            </div>


            <div className="device-details-status futuristic-device-status">

              <StatusBadge
                value="Online"
              />

              <div className="device-heartbeat">

                <i />

                <span>
                  Registered agent
                </span>

              </div>

              <div className="device-header-health">

                <span>
                  HEALTH SCORE
                </span>

                <strong>
                  {healthScore}%
                </strong>

              </div>

            </div>

          </div>

          <div className="device-header-scan" />

        </section>

      </ScrollReveal>


      {/* ===================================================
          REMOTE SCREEN
          =================================================== */}

      <ScrollReveal delay={80}>

        <section
          className="glass-card remote-screen-card"
        >

          <div className="remote-screen-header">

            <div>

              <span className="eyebrow">
                REMOTE CONTROL // ENDPOINT
              </span>

              <h3>
                Remote Screen
              </h3>

              <p>
                Establish a secure remote
                viewing and control session
                with this TechPilot endpoint.
              </p>

            </div>


            <div className="remote-controls">

              {remoteSessionId ? (

                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    stopRemoteView
                  }
                >
                  ■ End Session
                </button>

              ) : (

                <button
                  type="button"
                  className="primary-button"
                  onClick={
                    startRemoteView
                  }
                  disabled={
                    remoteStatus ===
                      "connecting" ||
                    recoveringSession
                  }
                >
                  {recoveringSession
                    ? "◌ Checking Session..."
                    : remoteStatus ===
                      "connecting"
                    ? "◌ Connecting..."
                    : "▶ Start Remote View"}
                </button>

              )}

            </div>

          </div>


          {remoteSessionId && (
            <div className="remote-session-status">

              <span>
                SESSION
              </span>

              <strong>
                #{remoteSessionId}
              </strong>

              <span
                className={
                  remoteStatus === "live"
                    ? "live"
                    : ""
                }
              >
                ●{" "}
                {remoteStatus ===
                "live"
                  ? "STREAM ACTIVE"
                  : "CONNECTING"}
              </span>

            </div>
          )}


          <div
            ref={
              remoteScreenRef
            }
            className="remote-screen-frame"
            tabIndex={0}
            onWheel={
              handleRemoteWheel
            }
            onKeyDown={
              handleRemoteKeyDown
            }
          >

            {remoteFrame ? (

              <img
                src={remoteFrame}
                alt={`Live screen of ${device.hostname}`}
                className="remote-screen-image"
                draggable={false}
                onMouseMove={
                  handleRemoteMouseMove
                }
                onClick={
                  handleRemoteClick
                }
                onDoubleClick={
                  handleRemoteDoubleClick
                }
                onContextMenu={
                  handleRemoteContextMenu
                }
              />

            ) : (

              <div className="remote-screen-loading">

                <div className="remote-screen-spinner" />

                <strong>

                  {recoveringSession
                    ? "Checking for existing remote session..."
                    : remoteStatus ===
                      "connecting"
                    ? "Establishing secure endpoint stream..."
                    : remoteStatus ===
                      "error"
                    ? "Remote session unavailable"
                    : "Waiting for endpoint stream..."}

                </strong>


                {remoteSessionId && (

                  <span>
                    Session #
                    {remoteSessionId}
                  </span>

                )}


                {remoteError && (

                  <p className="remote-error">
                    {remoteError}
                  </p>

                )}


                {!remoteSessionId &&
                  !remoteError &&
                  !recoveringSession && (

                    <span>
                      Start a remote
                      session to view
                      the endpoint.
                    </span>

                  )}

              </div>

            )}

          </div>


          {remoteFrame &&
            remoteStatus ===
              "live" && (

              <div className="remote-control-hint">

                <span>
                  MOUSE
                </span>

                <small>
                  Move · Click · Double-click · Right-click · Scroll
                </small>

                <span>
                  KEYBOARD
                </span>

                <small>
                  Click the remote screen and type normally
                </small>

              </div>

            )}


        </section>

      </ScrollReveal>


      {/* ===================================================
          DEVICE INFORMATION
          =================================================== */}

      <ScrollReveal delay={120}>

        <section className="glass-card">

          <div className="card-section-header">

            <div>

              <span className="eyebrow">
                ENDPOINT INVENTORY
              </span>

              <h3>
                Device Information
              </h3>

              <p>
                Live identity information
                received from the TechPilot
                agent API.
              </p>

            </div>

          </div>


          <div className="details-grid futuristic-details-grid">

            <DetailItem
              label="Hostname"
              value={
                device.hostname
              }
            />

            <DetailItem
              label="Device ID"
              value={
                device.device_id
              }
            />

            <DetailItem
              label="Agent ID"
              value={
                device.id
              }
            />

            <DetailItem
              label="Operating System"
              value={
                `${device.operating_system} ${device.os_version}`
              }
            />

            <DetailItem
              label="Agent Version"
              value={
                device.agent_version
              }
            />

            <DetailItem
              label="Registered At"
              value={
                device.registered_at
              }
            />

            <DetailItem
              label="IP Address"
              value="Not reported"
            />

            <DetailItem
              label="MAC Address"
              value="Not reported"
            />

          </div>

        </section>

      </ScrollReveal>


      {/* ===================================================
          RESOURCE PLACEHOLDERS
          =================================================== */}

      <ScrollReveal delay={160}>

        <section className="glass-card">

          <div className="card-section-header">

            <div>

              <span className="eyebrow">
                ENDPOINT TELEMETRY
              </span>

              <h3>
                Resource Monitoring
              </h3>

              <p>
                Live CPU, memory and disk
                telemetry will appear here
                once endpoint metrics are
                exposed by the agent API.
              </p>

            </div>

          </div>


          <div className="resource-grid">

            <button
              type="button"
              className={`resource-card ${
                activeResource ===
                "cpu"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveResource(
                  activeResource ===
                    "cpu"
                    ? null
                    : "cpu",
                )
              }
            >

              <span>
                CPU
              </span>

              <strong>
                --
              </strong>

              <small>
                Telemetry unavailable
              </small>

            </button>


            <button
              type="button"
              className={`resource-card ${
                activeResource ===
                "ram"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveResource(
                  activeResource ===
                    "ram"
                    ? null
                    : "ram",
                )
              }
            >

              <span>
                MEMORY
              </span>

              <strong>
                --
              </strong>

              <small>
                Telemetry unavailable
              </small>

            </button>


            <button
              type="button"
              className={`resource-card ${
                activeResource ===
                "disk"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActiveResource(
                  activeResource ===
                    "disk"
                    ? null
                    : "disk",
                )
              }
            >

              <span>
                DISK
              </span>

              <strong>
                --
              </strong>

              <small>
                Telemetry unavailable
              </small>

            </button>

          </div>

        </section>

      </ScrollReveal>


      {/* ===================================================
          FOOTER ACTION
          =================================================== */}

      <div className="device-details-footer">

        <button
          type="button"
          className="secondary-button"
          onClick={onBack}
        >
          ← Back to Devices
        </button>

      </div>

    </div>
  );
}


export default DeviceDetails;