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

type DeviceDetailsProps = {
  deviceId: string;
  onBack: () => void;
};

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
    <div className="clean-detail-item">
      <span>{label}</span>

      <strong>
        {value ?? "Not reported"}
      </strong>
    </div>
  );
}

function DeviceDetails({
  deviceId,
  onBack,
}: DeviceDetailsProps) {
  const [device, setDevice] =
    useState<Agent | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [startingSession, setStartingSession] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDevice() {
      try {
        setLoading(true);

        const agents =
          await getAgents();

        const matchedAgent =
          agents.find(
            (agent) =>
              agent.device_id ===
              deviceId,
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
          setLoading(false);
        }
      }
    }

    void loadDevice();

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const startRemoteView = async () => {
    if (!device || startingSession) {
      return;
    }

    try {
      setStartingSession(true);

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
    } finally {
      setStartingSession(false);
    }
  };

  if (loading) {
    return (
      <section className="glass-card device-details-empty futuristic-empty-state">
        <div className="empty-icon">
          ◌
        </div>

        <strong>
          Loading endpoint...
        </strong>

        <p>
          Loading TechPilot device
          information.
        </p>
      </section>
    );
  }

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
          The selected endpoint could not
          be found in the TechPilot inventory.
        </p>

        <button
          type="button"
          className="techpilot-secondary-button"
          onClick={onBack}
        >
          ← BACK TO DEVICES
        </button>
      </section>
    );
  }

  return (
    <div className="device-details-clean">
      <ScrollReveal delay={0}>
        <button
          type="button"
          className="back-button futuristic-back-button"
          onClick={onBack}
        >
          <span>←</span>
          BACK TO DEVICES
        </button>
      </ScrollReveal>

      <ScrollReveal delay={40}>
        <section className="glass-card clean-device-header">
          <div>
            <span className="eyebrow">
              MANAGED ENDPOINT
            </span>

            <h2>
              {device.hostname}
            </h2>

            <p>
              {device.operating_system}
              {" · "}
              {device.os_version}
            </p>

            <span className="clean-device-id">
              {device.device_id}
            </span>
          </div>

          <div className="clean-device-status">
            <i />
            REGISTERED
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal delay={80}>
        <section className="glass-card clean-remote-card">
          <div className="clean-remote-copy">
            <span className="eyebrow">
              REMOTE OPERATIONS
            </span>

            <h3>
              Remote Screen
            </h3>

            <p>
              Establish a secure remote viewing
              and control session with this
              TechPilot endpoint.
            </p>
          </div>

          <button
            type="button"
            className="techpilot-primary-button remote-session-button"
            onClick={startRemoteView}
            disabled={startingSession}
          >
            <span>
              {startingSession
                ? "◌"
                : "▶"}
            </span>

            {startingSession
              ? "STARTING SESSION..."
              : "START REMOTE SESSION"}
          </button>
        </section>
      </ScrollReveal>

      <ScrollReveal delay={120}>
        <section className="glass-card clean-information-card">
          <div className="clean-section-heading">
            <span className="eyebrow">
              ENDPOINT INFORMATION
            </span>

            <h3>
              Device Information
            </h3>
          </div>

          <div className="clean-details-grid">
            <DetailItem
              label="HOSTNAME"
              value={device.hostname}
            />

            <DetailItem
              label="DEVICE ID"
              value={device.device_id}
            />

            <DetailItem
              label="AGENT ID"
              value={device.id}
            />

            <DetailItem
              label="OPERATING SYSTEM"
              value={`${device.operating_system} ${device.os_version}`}
            />

            <DetailItem
              label="AGENT VERSION"
              value={`v${device.agent_version}`}
            />

            <DetailItem
              label="REGISTERED"
              value={new Date(
                device.registered_at,
              ).toLocaleString()}
            />
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}

export default DeviceDetails;