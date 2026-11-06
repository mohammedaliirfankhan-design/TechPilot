import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createDeviceEnrollment,
  getAgents,
  type Agent,
  type DeviceEnrollmentResponse,
} from "../api";

import {
  formatDate,
  formatDateTime,
  isOlderVersion,
} from "../lib/agentVersion";

import "../pages.css";

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
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEnrollment, setShowEnrollment] = useState(false);
  const [enrollment, setEnrollment] =
    useState<DeviceEnrollmentResponse | null>(null);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  /* ================= LOAD DEVICES ================= */

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
            err instanceof Error ? err.message : "Failed to load devices.",
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
    const query = searchQuery.trim().toLowerCase();

    const sorted = [...agents].sort((a, b) =>
      a.hostname.localeCompare(b.hostname),
    );

    if (!query) {
      return sorted;
    }

    return sorted.filter((agent) =>
      [
        agent.hostname,
        agent.device_id,
        agent.operating_system,
        agent.os_version,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [agents, searchQuery]);

  /* ================= ENROLLMENT ================= */

  async function handleCreateEnrollment() {
    try {
      setEnrollmentLoading(true);
      setEnrollmentError(null);
      setCopied(false);

      const data = await createDeviceEnrollment(token);

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

    // Return focus to the button that opened the dialog.
    window.setTimeout(() => addButtonRef.current?.focus(), 0);
  }

  async function handleCopyCode() {
    if (!enrollment) {
      return;
    }

    try {
      await navigator.clipboard.writeText(enrollment.enrollment_code);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      setEnrollmentError("Unable to copy the enrollment code.");
    }
  }

  // Escape closes the dialog; move focus into it when it opens.
  useEffect(() => {
    if (!showEnrollment) {
      return;
    }

    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseEnrollment();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showEnrollment]);

  /* ================= RENDER ================= */

  return (
    <div className="tpp">
      <div className="tpp-toolbar">
        <p className="tpp-count">
          {loading
            ? "Loading devices…"
            : searchQuery.trim()
            ? `${filteredAgents.length} of ${agents.length} devices`
            : `${agents.length} ${agents.length === 1 ? "device" : "devices"}`}
        </p>

        <button
          ref={addButtonRef}
          type="button"
          className="tpa-btn tpa-btn-primary"
          onClick={handleOpenEnrollment}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add device
        </button>
      </div>

      <section className="tpp-card tpp-card-flush" aria-label="Devices">
        {loading && <p className="tpp-state">Loading devices…</p>}

        {!loading && error && (
          <div className="tpp-state tpp-state-error" role="alert">
            <strong>Couldn't load devices.</strong>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && agents.length === 0 && (
          <div className="tpp-state">
            <strong>No devices yet.</strong>
            <p>
              Choose <strong>Add device</strong> to create an enrollment code,
              then run the installer on the PC.
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          agents.length > 0 &&
          filteredAgents.length === 0 && (
            <div className="tpp-state">
              <strong>No devices match "{searchQuery.trim()}".</strong>
              <p>Try a hostname, device ID or Windows version.</p>
            </div>
          )}

        {!loading && !error && filteredAgents.length > 0 && (
          <div className="tpp-table-wrap">
            <table className="tpp-table">
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">Operating system</th>
                  <th scope="col">Agent</th>
                  <th scope="col">Enrolled</th>
                  <th scope="col">
                    <span className="tpa-sr-only">Open</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="tpp-row-link"
                    onClick={() => onDeviceSelect?.(agent.device_id)}
                  >
                    <td>
                      <button
                        type="button"
                        className="tpp-device"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeviceSelect?.(agent.device_id);
                        }}
                      >
                        <strong>{agent.hostname}</strong>
                        <span>{agent.device_id}</span>
                      </button>
                    </td>
                    <td>
                      {agent.operating_system}{" "}
                      <span className="tpp-muted">{agent.os_version}</span>
                    </td>
                    <td>
                      <span className="tpp-mono">v{agent.agent_version}</span>
                      {isOlderVersion(agent.agent_version) && (
                        <span className="tpp-badge tpp-badge-warn">Update</span>
                      )}
                    </td>
                    <td className="tpp-muted">{formatDate(agent.registered_at)}</td>
                    <td className="tpp-chevron" aria-hidden="true">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ================= ADD DEVICE DIALOG ================= */}

      {showEnrollment && (
        <div
          className="tpp-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseEnrollment();
            }
          }}
        >
          <section
            ref={dialogRef}
            className="tpp-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tpp-enroll-title"
            tabIndex={-1}
          >
            <div className="tpp-dialog-head">
              <h2 id="tpp-enroll-title">Add a device</h2>

              <button
                type="button"
                className="tpa-icon-btn"
                onClick={handleCloseEnrollment}
                aria-label="Close"
              >
                <svg
                  aria-hidden="true"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            {enrollmentLoading && (
              <p className="tpp-state">Creating an enrollment code…</p>
            )}

            {!enrollmentLoading && enrollmentError && (
              <div className="tpp-state tpp-state-error" role="alert">
                <strong>Couldn't create an enrollment code.</strong>
                <p>{enrollmentError}</p>
                <button
                  type="button"
                  className="tpa-btn tpa-btn-primary"
                  onClick={() => void handleCreateEnrollment()}
                >
                  Try again
                </button>
              </div>
            )}

            {!enrollmentLoading && !enrollmentError && enrollment && (
              <div className="tpp-enroll">
                <ol className="tpp-enroll-steps">
                  <li>Copy the code below.</li>
                  <li>Run <strong>TechAIPILOTAgentSetup.exe</strong> on the PC.</li>
                  <li>Paste the code when the installer asks for it.</li>
                </ol>

                <div className="tpp-code" aria-label="Enrollment code">
                  {enrollment.enrollment_code}
                </div>

                <p className="tpp-muted tpp-small">
                  Single use. Expires {formatDateTime(enrollment.expires_at)}.
                  Don't share it outside your team.
                </p>

                <div className="tpp-dialog-actions">
                  <button
                    type="button"
                    className="tpa-btn tpp-btn-outline"
                    onClick={handleCloseEnrollment}
                  >
                    Done
                  </button>
                  <button
                    type="button"
                    className="tpa-btn tpa-btn-primary"
                    onClick={() => void handleCopyCode()}
                  >
                    {copied ? "Copied" : "Copy code"}
                  </button>
                </div>

                <p className="tpa-sr-only" aria-live="polite">
                  {copied ? "Enrollment code copied" : ""}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default Devices;
