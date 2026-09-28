import {
  useEffect,
  useState,
} from "react";

import ScrollReveal from "../components/ScrollReveal";

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

type DeviceDetailsProps = {
  deviceId: string;
  token: string;
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
  token,
}: DeviceDetailsProps) {
  const [device, setDevice] =
    useState<Agent | null>(null);

  const [loading, setLoading] =
    useState(true);

  /* =========================================================
     REMOTE SCREEN
     ========================================================= */

  const [startingSession, setStartingSession] =
    useState(false);

  /* =========================================================
     REMOTE SHELL
     ========================================================= */

  const [shellType, setShellType] =
    useState<ShellType>("POWERSHELL");

  const [shellSession, setShellSession] =
    useState<ShellSession | null>(null);

  const [openingShell, setOpeningShell] =
    useState(false);

  const [closingShell, setClosingShell] =
    useState(false);

  const [command, setCommand] =
    useState("");

  const [executingCommand, setExecutingCommand] =
    useState(false);

  const [shellOutput, setShellOutput] =
    useState("");

  const [shellError, setShellError] =
    useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDevice() {
      try {
        setLoading(true);

        const agents =
          await getAgents(token);

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
  }, [deviceId, token]);

  /* =========================================================
     REMOTE SCREEN
     DO NOT MODIFY THE EXISTING REMOTE FLOW
     ========================================================= */

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
          token,
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

  /* =========================================================
     OPEN REMOTE SHELL
     ========================================================= */

  const openShell = async () => {
  if (!device || openingShell) {
    return;
  }

  try {
    setOpeningShell(true);
    setShellError("");
    setShellOutput("");

    const session =
      await createShellSession(
        device.device_id,
        shellType,
        token,
      );

    setShellSession(session);

    console.log(
      "[SHELL] Session created:",
      session,
    );

    /*
     * The backend initially returns REQUESTED.
     * The Agent polls for pending sessions and
     * accepts the session asynchronously.
     *
     * Poll the backend until the session becomes
     * ACTIVE so the UI reflects the real state.
     */

    const maxAttempts = 15;
    const pollDelayMs = 1000;

    for (
      let attempt = 0;
      attempt < maxAttempts;
      attempt += 1
    ) {
      await new Promise((resolve) =>
        window.setTimeout(
          resolve,
          pollDelayMs,
        ),
      );

      try {
        const updatedSession =
          await getShellSession(
            session.session_id,
            token,
          );

        setShellSession(updatedSession);

        console.log(
          "[SHELL] Session status:",
          updatedSession.status,
        );

        if (
          updatedSession.status === "ACTIVE"
        ) {
          break;
        }

        if (
          updatedSession.status === "ENDED" ||
          updatedSession.status === "CLOSED"
        ) {
          break;
        }
      } catch (statusError) {
        console.error(
          "[SHELL] Failed to refresh session status:",
          statusError,
        );

        /*
         * Do not immediately destroy the session
         * state if a single status request fails.
         * The session itself may still be valid.
         */
      }
    }
  } catch (error) {
    console.error(
      "[SHELL] Failed to create shell session:",
      error,
    );

    setShellError(
      error instanceof Error
        ? error.message
        : "Failed to open remote shell.",
    );
  } finally {
    setOpeningShell(false);
  }
};

  /* =========================================================
     CLOSE REMOTE SHELL
     ========================================================= */

  const closeShell = async () => {
    if (!shellSession || closingShell) {
      return;
    }

    try {
      setClosingShell(true);
      setShellError("");

      await closeShellSession(
        shellSession.session_id,
        token,
      );

      setShellSession(null);
      setCommand("");
      setShellOutput("");

      console.log(
        "[SHELL] Session closed:",
        shellSession.session_id,
      );
    } catch (error) {
      console.error(
        "[SHELL] Failed to close shell session:",
        error,
      );

      setShellError(
        error instanceof Error
          ? error.message
          : "Failed to close shell session.",
      );
    } finally {
      setClosingShell(false);
    }
  };

  /* =========================================================
     EXECUTE COMMAND
     ========================================================= */

  const executeCommand = async () => {
    if (
      !shellSession ||
      !command.trim() ||
      executingCommand
    ) {
      return;
    }

    try {
      setExecutingCommand(true);
      setShellError("");
      setShellOutput("");

      const createdCommand =
        await createShellCommand(
          shellSession.session_id,
          command,
          token,
        );

      console.log(
        "[SHELL] Command created:",
        createdCommand,
      );

      /*
       * The Agent polls the backend for pending
       * commands, executes the command, and submits
       * the result. Poll until the command reaches
       * a terminal state.
       */

      const maxAttempts = 120;
      const pollDelayMs = 1000;

      let result = createdCommand;

      for (
        let attempt = 0;
        attempt < maxAttempts;
        attempt += 1
      ) {
        await new Promise((resolve) =>
          window.setTimeout(
            resolve,
            pollDelayMs,
          ),
        );

        result =
          await getShellCommand(
            createdCommand.command_id,
            token,
          );

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
          "Command is still running. Refresh the command later to retrieve its result.",
        );
      }

      const outputParts: string[] = [];

      if (result.stdout) {
        outputParts.push(result.stdout);
      }

      if (result.stderr) {
        outputParts.push(
          `[stderr]\n${result.stderr}`,
        );
      }

      if (
        result.exit_code !== null &&
        result.exit_code !== undefined
      ) {
        outputParts.push(
          `\n[exit code: ${result.exit_code}]`,
        );
      }

      setShellOutput(
        outputParts.join("\n") ||
          "(Command completed with no output.)",
      );

      setCommand("");
    } catch (error) {
      console.error(
        "[SHELL] Command execution failed:",
        error,
      );

      setShellError(
        error instanceof Error
          ? error.message
          : "Failed to execute command.",
      );
    } finally {
      setExecutingCommand(false);
    }
  };

  /* =========================================================
     LOADING
     ========================================================= */

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
          Loading TechAIPILOT device
          information.
        </p>
      </section>
    );
  }

  /* =========================================================
     DEVICE NOT FOUND
     ========================================================= */

  if (!device) {
    return (
      <section className="glass-card device-details-empty futuristic-empty-state">
        <div className="empty-icon">
          ⌁
        </div>

        <strong>
          Device not found
        </strong>

        <p>
          The selected endpoint could not
          be found in the TechAIPILOT
          inventory.
        </p>

        <button
          type="button"
          className="clean-device-back-button"
          onClick={onBack}
        >
          ← BACK TO DEVICES
        </button>
      </section>
    );
  }

  return (
    <div className="device-details-page">

      {/* =====================================================
          DEVICE HEADER
          ===================================================== */}

      <ScrollReveal>
        <section className="glass-card clean-device-header">
          <div className="clean-device-heading">
            <button
              type="button"
              className="clean-device-back-button"
              onClick={onBack}
            >
              ← BACK
            </button>

            <div>
              <span className="eyebrow">
                ENDPOINT
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
          </div>

          <div className="clean-device-status">
            <i />
            REGISTERED
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          REMOTE SCREEN
          EXISTING FUNCTIONALITY PRESERVED
          ===================================================== */}

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
              TechAIPILOT endpoint.
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

      {/* =====================================================
          REMOTE SHELL
          ===================================================== */}

      <ScrollReveal delay={100}>
        <section className="glass-card clean-remote-card">
          <div className="clean-remote-copy">
            <span className="eyebrow">
              REMOTE OPERATIONS
            </span>

            <h3>
              Remote Shell
            </h3>

            <p>
              Execute authorized PowerShell
              or CMD commands directly on this
              TechAIPILOT endpoint.
            </p>
          </div>

          {!shellSession ? (
            <div className="shell-launch-panel">
              <label
                className="shell-select-label"
                htmlFor="shell-type"
              >
                SHELL
              </label>

              <select
                id="shell-type"
                className="shell-type-select"
                value={shellType}
                onChange={(event) =>
                  setShellType(
                    event.target.value as ShellType,
                  )
                }
              >
                <option value="POWERSHELL">
                  PowerShell
                </option>

                <option value="CMD">
                  Command Prompt
                </option>
              </select>

              <button
                type="button"
                className="techpilot-primary-button remote-session-button"
                onClick={openShell}
                disabled={openingShell}
              >
                <span>
                  {openingShell
                    ? "◌"
                    : "▶"}
                </span>

                {openingShell
                  ? "OPENING SHELL..."
                  : "OPEN REMOTE SHELL"}
              </button>
            </div>
          ) : (
            <div className="shell-console-panel">

              <div className="shell-console-header">
                <div>
                  <span className="eyebrow">
                    ACTIVE SHELL
                  </span>

                  <strong>
                    {shellSession.shell_type ===
                    "POWERSHELL"
                      ? "PowerShell"
                      : "Command Prompt"}
                  </strong>
                </div>

                <span className="shell-status">
                  {shellSession.status}
                </span>
              </div>

              <div className="shell-command-row">
                <input
                  type="text"
                  className="shell-command-input"
                  value={command}
                  onChange={(event) =>
                    setCommand(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();
                      void executeCommand();
                    }
                  }}
                  placeholder={
                    shellSession.shell_type ===
                    "POWERSHELL"
                      ? "Enter PowerShell command..."
                      : "Enter CMD command..."
                  }
                  disabled={executingCommand}
                />

                <button
                  type="button"
                  className="techpilot-primary-button"
                  onClick={executeCommand}
                  disabled={
                    executingCommand ||
                    !command.trim()
                  }
                >
                  {executingCommand
                    ? "RUNNING..."
                    : "EXECUTE"}
                </button>
              </div>

              <div className="shell-output">
                <div className="shell-output-label">
                  OUTPUT
                </div>

                <pre>
                  {executingCommand
                    ? "Executing command..."
                    : shellOutput ||
                      "Command output will appear here."}
                </pre>
              </div>

              {shellError && (
                <div className="shell-error">
                  {shellError}
                </div>
              )}

              <div className="shell-console-actions">
                <button
                  type="button"
                  className="TECHAIPILOT-secondary-button"
                  onClick={closeShell}
                  disabled={closingShell}
                >
                  {closingShell
                    ? "CLOSING..."
                    : "CLOSE SHELL"}
                </button>
              </div>
            </div>
          )}

          {shellError && !shellSession && (
            <div className="shell-error">
              {shellError}
            </div>
          )}
        </section>
      </ScrollReveal>

      {/* =====================================================
          DEVICE INFORMATION
          ===================================================== */}

      <ScrollReveal delay={140}>
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