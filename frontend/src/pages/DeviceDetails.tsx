import {
  useEffect,
  useState,
} from "react";

import {
  closeShellSession,
  createRemoteSession,
  createShellCommand,
  createShellSession,
  getAgents,
  getShellCommand,
  getShellSession,
  type Agent,
  type ShellSession,
  type ShellType,
} from "../api";

import {
  formatDateTime,
  isOlderVersion,
} from "../lib/agentVersion";

import "../pages.css";

type DeviceDetailsProps = {
  deviceId: string;
  token: string;
  onBack: () => void;
};

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="tpp-back" onClick={onBack}>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m15 6-6 6 6 6" />
      </svg>
      All devices
    </button>
  );
}

function DeviceDetails({
  deviceId,
  onBack,
  token,
}: DeviceDetailsProps) {
  const [device, setDevice] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  /* ================= REMOTE SCREEN ================= */

  const [startingSession, setStartingSession] = useState(false);
  const [sessionError, setSessionError] = useState("");

  /* ================= REMOTE SHELL ================= */

  const [shellType, setShellType] = useState<ShellType>("POWERSHELL");
  const [shellSession, setShellSession] = useState<ShellSession | null>(null);
  const [openingShell, setOpeningShell] = useState(false);
  const [closingShell, setClosingShell] = useState(false);
  const [command, setCommand] = useState("");
  const [lastCommand, setLastCommand] = useState("");
  const [executingCommand, setExecutingCommand] = useState(false);
  const [shellOutput, setShellOutput] = useState("");
  const [shellError, setShellError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDevice() {
      try {
        setLoading(true);

        const agents = await getAgents(token);

        const matchedAgent = agents.find(
          (agent) => agent.device_id === deviceId,
        );

        if (!cancelled) {
          setDevice(matchedAgent ?? null);
        }
      } catch (error) {
        console.error("[DEVICE] Failed to load agent:", error);

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
  }, [deviceId, token]);

  /* =========================================================
     REMOTE SCREEN (same flow as before; errors now inline)
     ========================================================= */

  const startRemoteView = async () => {
    if (!device || startingSession) {
      return;
    }

    try {
      setStartingSession(true);
      setSessionError("");

      const session = await createRemoteSession(device.device_id, token);

      const remoteUrl = `/?remote_session=${encodeURIComponent(
        String(session.session_id),
      )}`;

      window.open(remoteUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("[REMOTE] Failed to start session:", error);

      setSessionError(
        error instanceof Error
          ? error.message
          : "Failed to start remote session.",
      );
    } finally {
      setStartingSession(false);
    }
  };

  /* ================= OPEN REMOTE SHELL ================= */

  const openShell = async () => {
    if (!device || openingShell) {
      return;
    }

    try {
      setOpeningShell(true);
      setShellError("");
      setShellOutput("");
      setLastCommand("");

      const session = await createShellSession(
        device.device_id,
        shellType,
        token,
      );

      setShellSession(session);

      // The agent accepts the session asynchronously; poll until ACTIVE.
      const maxAttempts = 15;
      const pollDelayMs = 1000;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));

        try {
          const updatedSession = await getShellSession(
            session.session_id,
            token,
          );

          setShellSession(updatedSession);

          if (
            updatedSession.status === "ACTIVE" ||
            updatedSession.status === "ENDED" ||
            updatedSession.status === "CLOSED"
          ) {
            break;
          }
        } catch (statusError) {
          // A single failed status check does not mean the session is gone.
          console.error("[SHELL] Failed to refresh session status:", statusError);
        }
      }
    } catch (error) {
      console.error("[SHELL] Failed to create shell session:", error);

      setShellError(
        error instanceof Error ? error.message : "Failed to open remote shell.",
      );
    } finally {
      setOpeningShell(false);
    }
  };

  /* ================= CLOSE REMOTE SHELL ================= */

  const closeShell = async () => {
    if (!shellSession || closingShell) {
      return;
    }

    try {
      setClosingShell(true);
      setShellError("");

      await closeShellSession(shellSession.session_id, token);

      setShellSession(null);
      setCommand("");
      setLastCommand("");
      setShellOutput("");
    } catch (error) {
      console.error("[SHELL] Failed to close shell session:", error);

      setShellError(
        error instanceof Error ? error.message : "Failed to close shell session.",
      );
    } finally {
      setClosingShell(false);
    }
  };

  /* ================= EXECUTE COMMAND ================= */

  const executeCommand = async () => {
    if (!shellSession || !command.trim() || executingCommand) {
      return;
    }

    const submitted = command;

    try {
      setExecutingCommand(true);
      setShellError("");
      setShellOutput("");
      setLastCommand(submitted);

      const createdCommand = await createShellCommand(
        shellSession.session_id,
        submitted,
        token,
      );

      // The agent polls for commands, runs them and posts the result.
      const maxAttempts = 120;
      const pollDelayMs = 1000;

      let result = createdCommand;

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, pollDelayMs));

        result = await getShellCommand(createdCommand.command_id, token);

        if (
          result.status === "COMPLETED" ||
          result.status === "FAILED" ||
          result.status === "TIMEOUT"
        ) {
          break;
        }
      }

      if (
        result.status !== "COMPLETED" &&
        result.status !== "FAILED" &&
        result.status !== "TIMEOUT"
      ) {
        setShellError(
          "The command is still running. Its result was not available after 2 minutes.",
        );
      }

      const outputParts: string[] = [];

      if (result.stdout) {
        outputParts.push(result.stdout);
      }

      if (result.stderr) {
        outputParts.push(`[stderr]\n${result.stderr}`);
      }

      if (result.exit_code !== null && result.exit_code !== undefined) {
        outputParts.push(`\n[exit code: ${result.exit_code}]`);
      }

      setShellOutput(
        outputParts.join("\n") || "(Command completed with no output.)",
      );

      setCommand("");
    } catch (error) {
      console.error("[SHELL] Command execution failed:", error);

      setShellError(
        error instanceof Error ? error.message : "Failed to execute command.",
      );
    } finally {
      setExecutingCommand(false);
    }
  };

  /* ================= LOADING / NOT FOUND ================= */

  if (loading) {
    return (
      <div className="tpp">
        <BackButton onBack={onBack} />
        <p className="tpp-state">Loading device…</p>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="tpp">
        <BackButton onBack={onBack} />
        <div className="tpp-card tpp-state">
          <strong>Device not found.</strong>
          <p>
            It may have been removed, or it belongs to another organisation.
          </p>
        </div>
      </div>
    );
  }

  const prompt = shellSession?.shell_type === "CMD" ? "C:\\>" : "PS>";
  const shellLabel =
    shellSession?.shell_type === "CMD" ? "Command Prompt" : "PowerShell";
  const shellActive = shellSession?.status === "ACTIVE";
  const outdated = isOlderVersion(device.agent_version);

  return (
    <div className="tpp">
      <BackButton onBack={onBack} />

      {/* ================= DEVICE HEADER ================= */}

      <section className="tpp-card tpp-device-head">
        <div className="tpp-device-title">
          <h2>{device.hostname}</h2>
          <p className="tpp-muted">
            {device.operating_system} {device.os_version} · Agent v
            {device.agent_version}
            {outdated && (
              <span className="tpp-badge tpp-badge-warn">Update available</span>
            )}
          </p>
          <p className="tpp-mono tpp-muted tpp-small">{device.device_id}</p>
        </div>

        <div className="tpp-device-actions">
          <button
            type="button"
            className="tpa-btn tpa-btn-primary"
            onClick={startRemoteView}
            disabled={startingSession}
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
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="12" rx="2" />
              <path d="M8 20h8M12 16v4" />
            </svg>
            {startingSession ? "Starting session…" : "Start remote session"}
          </button>
        </div>

        {sessionError && (
          <p className="tpp-inline-error" role="alert">
            Couldn't start the remote session: {sessionError}
          </p>
        )}
      </section>

      <div className="tpp-grid">
        {/* ================= REMOTE SHELL ================= */}

        <section className="tpp-card tpp-shell-card" aria-labelledby="tpp-shell-title">
          <div className="tpp-card-head">
            <div>
              <h2 id="tpp-shell-title">Remote shell</h2>
              <p className="tpp-muted tpp-small">
                Run PowerShell or CMD commands without taking over the screen.
              </p>
            </div>

            {shellSession && (
              <span
                className={`tpp-badge ${
                  shellActive ? "tpp-badge-ok" : "tpp-badge-neutral"
                }`}
              >
                {shellActive ? "Connected" : shellSession.status.toLowerCase()}
              </span>
            )}
          </div>

          {!shellSession ? (
            <div className="tpp-shell-launch">
              <label className="tpp-field">
                <span>Shell</span>
                <select
                  value={shellType}
                  onChange={(event) =>
                    setShellType(event.target.value as ShellType)
                  }
                >
                  <option value="POWERSHELL">PowerShell</option>
                  <option value="CMD">Command Prompt</option>
                </select>
              </label>

              <button
                type="button"
                className="tpa-btn tpp-btn-outline"
                onClick={openShell}
                disabled={openingShell}
              >
                {openingShell ? "Waiting for the agent…" : "Open shell"}
              </button>
            </div>
          ) : (
            <>
              <div className="tpp-terminal" aria-live="polite">
                <div className="tpp-terminal-bar">
                  <span>{shellLabel}</span>
                  <span>{device.hostname}</span>
                </div>

                <pre>
                  {lastCommand && (
                    <span className="tpp-terminal-cmd">
                      {prompt} {lastCommand}
                      {"\n"}
                    </span>
                  )}
                  {executingCommand
                    ? "Running…"
                    : shellOutput ||
                      (shellActive
                        ? "Type a command below and press Enter."
                        : "Waiting for the agent to accept the shell…")}
                </pre>
              </div>

              <div className="tpp-command-row">
                <span className="tpp-prompt" aria-hidden="true">
                  {prompt}
                </span>
                <label className="tpa-sr-only" htmlFor="tpp-command">
                  Command
                </label>
                <input
                  id="tpp-command"
                  type="text"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void executeCommand();
                    }
                  }}
                  placeholder={
                    shellSession.shell_type === "POWERSHELL"
                      ? "Get-Service Spooler"
                      : "ipconfig /all"
                  }
                  spellCheck={false}
                  autoComplete="off"
                  disabled={executingCommand}
                />
                <button
                  type="button"
                  className="tpa-btn tpa-btn-primary"
                  onClick={executeCommand}
                  disabled={executingCommand || !command.trim()}
                >
                  {executingCommand ? "Running…" : "Run"}
                </button>
              </div>

              <div className="tpp-shell-foot">
                <button
                  type="button"
                  className="tpa-btn tpp-btn-outline"
                  onClick={closeShell}
                  disabled={closingShell}
                >
                  {closingShell ? "Closing…" : "Close shell"}
                </button>
              </div>
            </>
          )}

          {shellError && (
            <p className="tpp-inline-error" role="alert">
              {shellError}
            </p>
          )}
        </section>

        {/* ================= DEVICE INFORMATION ================= */}

        <section className="tpp-card" aria-labelledby="tpp-info-title">
          <h2 id="tpp-info-title" className="tpp-card-title">
            Device information
          </h2>

          <dl className="tpp-info">
            <div>
              <dt>Hostname</dt>
              <dd>{device.hostname}</dd>
            </div>
            <div>
              <dt>Device ID</dt>
              <dd className="tpp-mono">{device.device_id}</dd>
            </div>
            <div>
              <dt>Agent ID</dt>
              <dd>{device.id}</dd>
            </div>
            <div>
              <dt>Operating system</dt>
              <dd>
                {device.operating_system} {device.os_version}
              </dd>
            </div>
            <div>
              <dt>Agent version</dt>
              <dd>v{device.agent_version}</dd>
            </div>
            <div>
              <dt>Enrolled</dt>
              <dd>{formatDateTime(device.registered_at)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

export default DeviceDetails;
