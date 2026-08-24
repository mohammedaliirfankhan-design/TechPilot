import {
  useEffect,
  useState,
} from "react";

import ScrollReveal from "../components/ScrollReveal";

import {
  createRemoteSession,
  getAgents,
  type Agent,
} from "../api";


/* =========================================================
   TYPES
   ========================================================= */

type DeviceDetailsProps = {
  deviceId: string;
  onBack: () => void;
};


type ResourceType =
  | "cpu"
  | "ram"
  | "disk"
  | null;



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
     HEALTH SCORE
     ======================================================= */

  const healthScore =
    device ? 100 : 0;



  /* =======================================================
     START REMOTE SESSION
     ======================================================= */

  const startRemoteView = async () => {

    if (!device) {
      return;
    }

    try {

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

      const remoteUrl =
        `/?remote_session=${encodeURIComponent(
          String(session.session_id),
        )}`;

      /*
       * The remote viewer is deliberately kept
       * outside DeviceDetails. Open it in a
       * separate browser tab.
       */
      window.open(
        remoteUrl,
        "_blank",
        "noopener,noreferrer",
      );

    } catch (error) {

      console.error(
        "[REMOTE] Failed to start session:",
        error,
      );

      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to start remote session.",
      );
    }
  };


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
          REMOTE CONTROL
          =================================================== */}

      <ScrollReveal delay={80}>

        <section className="glass-card remote-screen-card">

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
                The remote viewer opens in a
                separate browser tab.
              </p>

            </div>

            <div className="remote-controls">

              <button
                type="button"
                className="primary-button"
                onClick={startRemoteView}
              >
                ▶ Start Remote Session
              </button>

            </div>

          </div>

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