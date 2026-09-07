import {
  useEffect,
  useMemo,
  useState,
} from "react";

import ScrollReveal from "../components/ScrollReveal";
import {
  createDeviceEnrollment,
  getAgents,
  type Agent,
  type DeviceEnrollmentResponse,
} from "../api";

type DevicesProps = {
  searchQuery?: string;
  onDeviceSelect?: (deviceId: string) => void;
  token: string;
};

function Devices({
  searchQuery = "",
  token,
  onDeviceSelect,
}: DevicesProps) {
  const [agents, setAgents] =
    useState<Agent[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [showEnrollment, setShowEnrollment] =
    useState(false);

  const [enrollment, setEnrollment] =
    useState<DeviceEnrollmentResponse | null>(null);

  const [enrollmentLoading, setEnrollmentLoading] =
    useState(false);

  const [enrollmentError, setEnrollmentError] =
    useState<string | null>(null);

  const [copied, setCopied] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAgents() {
      try {
        setLoading(true);
        setError(null);

        const data = await getAgents(token);

        if (!cancelled) {
          setAgents(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load devices.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAgents();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const filteredAgents = useMemo(() => {
    const query =
      searchQuery.trim().toLowerCase();

    if (!query) {
      return agents;
    }

    return agents.filter((agent) =>
      [
        agent.hostname,
        agent.device_id,
        agent.operating_system,
        agent.os_version,
      ].some((value) =>
        value
          .toLowerCase()
          .includes(query),
      ),
    );
  }, [agents, searchQuery]);

  async function handleCreateEnrollment() {
    try {
      setEnrollmentLoading(true);
      setEnrollmentError(null);
      setCopied(false);

      const data =
        await createDeviceEnrollment(token);

      setEnrollment(data);
    } catch (err) {
      setEnrollmentError(
        err instanceof Error
          ? err.message
          : "Failed to create enrollment code.",
      );
    } finally {
      setEnrollmentLoading(false);
    }
  }

  function handleOpenEnrollment() {
    setShowEnrollment(true);
    setEnrollment(null);
    setEnrollmentError(null);
    setCopied(false);

    void handleCreateEnrollment();
  }

  function handleCloseEnrollment() {
    setShowEnrollment(false);
    setEnrollment(null);
    setEnrollmentError(null);
    setCopied(false);
  }

  async function handleCopyCode() {
    if (!enrollment) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        enrollment.enrollment_code,
      );

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setEnrollmentError(
        "Unable to copy the enrollment code.",
      );
    }
  }

  return (
    <div className="devices-clean">
      <ScrollReveal delay={0}>
        <section className="devices-clean-header">
          <div>
            <span className="eyebrow">
              ENDPOINT INVENTORY
            </span>

            <h2>
              Connected Devices
            </h2>

            <p>
              Select an endpoint to view its
              details and start secure remote
              support.
            </p>
          </div>

          <div className="devices-header-actions">
            <button
              type="button"
              className="devices-add-button"
              onClick={handleOpenEnrollment}
            >
              <span>+</span>
              ADD DEVICE
            </button>

            <div className="devices-count">
              <span>REGISTERED</span>

              <strong>
                {agents.length
                  .toString()
                  .padStart(2, "0")}
              </strong>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal delay={60}>
        <section className="devices-list glass-card">
          {loading && (
            <div className="devices-empty">
              <span className="devices-loading-dot" />

              <strong>
                Loading endpoints...
              </strong>

              <p>
                Synchronizing with the
                TechAIPILOT agent API.
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="devices-empty devices-error">
              <strong>
                Unable to load endpoints
              </strong>

              <p>{error}</p>
            </div>
          )}

          {!loading &&
            !error &&
            filteredAgents.length === 0 && (
              <div className="devices-empty">
                <strong>
                  No connected endpoints
                </strong>

                <p>
                  No registered TechAIPILOT agents
                  match your search.
                </p>
              </div>
            )}

          {!loading &&
            !error &&
            filteredAgents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className="device-list-item"
                onClick={() =>
                  onDeviceSelect?.(
                    agent.device_id,
                  )
                }
              >
                <div className="device-list-status">
                  <i />
                </div>

                <div className="device-list-main">
                  <span className="device-list-eyebrow">
                    ENDPOINT
                  </span>

                  <strong>
                    {agent.hostname}
                  </strong>

                  <span className="device-list-id">
                    {agent.device_id}
                  </span>
                </div>

                <div className="device-list-meta">
                  <span>
                    OPERATING SYSTEM
                  </span>

                  <strong>
                    {agent.operating_system}
                  </strong>

                  <small>
                    {agent.os_version}
                  </small>
                </div>

                <div className="device-list-meta">
                  <span>
                    AGENT
                  </span>

                  <strong>
                    v{agent.agent_version}
                  </strong>

                  <small>
                    Registered
                  </small>
                </div>

                <div className="device-list-action">
                  <span>
                    REMOTE SUPPORT
                  </span>

                  <strong>
                    OPEN →
                  </strong>
                </div>
              </button>
            ))}
        </section>
      </ScrollReveal>

      {showEnrollment && (
        <div
          className="device-enrollment-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseEnrollment();
            }
          }}
        >
          <section
            className="device-enrollment-modal glass-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-enrollment-title"
          >
            <div className="device-enrollment-header">
              <div>
                <span className="eyebrow">
                  SECURE ONBOARDING
                </span>

                <h3 id="device-enrollment-title">
                  Add a Device
                </h3>
              </div>

              <button
                type="button"
                className="device-enrollment-close"
                onClick={handleCloseEnrollment}
                aria-label="Close add device dialog"
              >
                ×
              </button>
            </div>

            {enrollmentLoading && (
              <div className="device-enrollment-state">
                <span className="devices-loading-dot" />

                <strong>
                  Generating enrollment code...
                </strong>

                <p>
                  Creating a secure one-time
                  onboarding credential.
                </p>
              </div>
            )}

            {!enrollmentLoading &&
              enrollmentError && (
                <div className="device-enrollment-state devices-error">
                  <strong>
                    Unable to create enrollment code
                  </strong>

                  <p>
                    {enrollmentError}
                  </p>

                  <button
                    type="button"
                    className="devices-add-button"
                    onClick={() =>
                      void handleCreateEnrollment()
                    }
                  >
                    TRY AGAIN
                  </button>
                </div>
              )}

            {!enrollmentLoading &&
              !enrollmentError &&
              enrollment && (
                <div className="device-enrollment-content">
                  <p>
                    Enter this code during the
                    device installation process.
                    It can only be used once.
                  </p>

                  <div className="device-enrollment-code">
                    {enrollment.enrollment_code}
                  </div>

                  <div className="device-enrollment-expiry">
                    <span>EXPIRES</span>

                    <strong>
                      15 MINUTES
                    </strong>
                  </div>

                  <div className="device-enrollment-actions">
                    <button
                      type="button"
                      className="devices-copy-button"
                      onClick={() =>
                        void handleCopyCode()
                      }
                    >
                      {copied
                        ? "COPIED"
                        : "COPY CODE"}
                    </button>

                    <button
                      type="button"
                      className="device-enrollment-done"
                      onClick={handleCloseEnrollment}
                    >
                      DONE
                    </button>
                  </div>

                  <small>
                    Never share this code publicly.
                  </small>
                </div>
              )}
          </section>
        </div>
      )}
    </div>
  );
}

export default Devices;