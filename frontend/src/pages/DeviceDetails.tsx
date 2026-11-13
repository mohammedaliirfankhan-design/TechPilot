import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";

import {
  closeShellSession,
  createRemoteSession,
  createShellCommand,
  createShellSession,
  getAgents,
  getShellCommand,
  getShellSession,
  removeDevice,
  renameDevice,
  type Agent,
  type ShellSession,
  type ShellType,
} from "../api";

import {
  deviceName,
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

  /* ================= RENAME ================= */

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const renameButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  const startRename = () => {
    if (!device) {
      return;
    }

    setNameDraft(device.display_name ?? "");
    setNameError("");
    setEditingName(true);
  };

  const cancelRename = () => {
    setEditingName(false);
    setNameError("");
    window.setTimeout(() => renameButtonRef.current?.focus(), 0);
  };

  const saveRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!device || savingName) {
      return;
    }

    try {
      setSavingName(true);
      setNameError("");

      const updated = await renameDevice(device.device_id, nameDraft, token);

      setDevice({ ...device, display_name: updated.display_name ?? null });
      setEditingName(false);
      window.setTimeout(() => renameButtonRef.current?.focus(), 0);
    } catch (error) {
      setNameError(
        error instanceof Error ? error.message : "Couldn't rename the device.",
      );
    } finally {
      setSavingName(false);
    }
  };

  /* ================= REMOVE ================= */

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const removeButtonRef = useRef<HTMLButtonElement | null>(null);
  const cancelRemoveRef = useRef<HTMLButtonElement | null>(null);

  const closeRemoveDialog = () => {
    if (removing) {
      return;
    }

    setConfirmRemove(false);
    setRemoveError("");
    window.setTimeout(() => removeButtonRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (!confirmRemove) {
      return;
    }

    cancelRemoveRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeRemoveDialog();
      }
    };

    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [confirmRemove, removing]);

  const confirmRemoveDevice = async () => {
    if (!device || removing) {
      return;
    }

    try {
      setRemoving(true);
      setRemoveError("");

      await removeDevice(device.device_id, token);

      // Back to the device list, which reloads without this device.
      onBack();
    } catch (error) {
      setRemoveError(
        error instanceof Error ? error.message : "Couldn't remove the device.",
      );
      setRemoving(false);
    }
  };

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
          {editingName ? (
            <form className="tpp-rename" onSubmit={saveRename}>
              <label className="tpa-sr-only" htmlFor="tpp-rename-input">
                Device name
              </label>
              <input
                id="tpp-rename-input"
                ref={nameInputRef}
                type="text"
                value={nameDraft}
                maxLength={100}
                placeholder={device.hostname}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelRename();
                  }
                }}
                disabled={savingName}
              />
              <button
                type="submit"
                className="tpa-btn tpa-btn-primary"
                disabled={savingName}
              >
                {savingName ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="tpa-btn tpp-btn-outline"
                onClick={cancelRename}
                disabled={savingName}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="tpp-name-row">
              <h2>{deviceName(device)}</h2>
              <button
                ref={renameButtonRef}
                type="button"
                className="tpa-icon-btn tpp-rename-btn"
                onClick={startRename}
                aria-label="Rename device"
                title="Rename device"
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4Z" />
                  <path d="m13.5 6.5 4 4" />
                </svg>
              </button>
            </div>
          )}

          {editingName && (
            <p className="tpp-muted tpp-small">
              Leave empty to show the hostname, {device.hostname}.
            </p>
          )}

          {!editingName && device.display_name && (
            <p className="tpp-muted tpp-small">Hostname: {device.hostname}</p>
          )}

          {nameError && (
            <p className="tpp-inline-error" role="alert">
              {nameError}
            </p>
          )}
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
                  <span>{deviceName(device)}</span>
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
            {device.display_name && (
              <div>
                <dt>Name in console</dt>
                <dd>{device.display_name}</dd>
              </div>
            )}
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

      {/* ================= REMOVE DEVICE ================= */}

      <section className="tpp-card tpp-danger" aria-labelledby="tpp-remove-title">
        <div>
          <h2 id="tpp-remove-title" className="tpp-card-title">
            Remove device
          </h2>
          <p className="tpp-muted tpp-small">
            Removes this device from the console and revokes its agent's
            access. Its history is kept, and the PC can be enrolled again
            later with a new code.
          </p>
        </div>

        <button
          ref={removeButtonRef}
          type="button"
          className="tpa-btn tpp-btn-danger"
          onClick={() => {
            setRemoveError("");
            setConfirmRemove(true);
          }}
        >
          Remove device
        </button>
      </section>

      {confirmRemove && (
        <div
          className="tpp-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeRemoveDialog();
            }
          }}
        >
          <section
            className="tpp-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="tpp-remove-dialog-title"
            aria-describedby="tpp-remove-dialog-body"
          >
            <div className="tpp-dialog-head">
              <h2 id="tpp-remove-dialog-title">
                Remove {deviceName(device)}?
              </h2>
            </div>

            <div id="tpp-remove-dialog-body" className="tpp-enroll">
              <ul className="tpp-enroll-steps">
                <li>It disappears from Devices, Home and Network security.</li>
                <li>Any open remote session on it ends now.</li>
                <li>Its agent can no longer connect to TechAIPILOT.</li>
              </ul>

              <p className="tpp-muted tpp-small">
                This does not uninstall the agent from the PC. Uninstall it
                there too, under Settings → Apps → TechAIPILOT Agent.
              </p>

              {removeError && (
                <p className="tpp-inline-error" role="alert">
                  {removeError}
                </p>
              )}

              <div className="tpp-dialog-actions">
                <button
                  ref={cancelRemoveRef}
                  type="button"
                  className="tpa-btn tpp-btn-outline"
                  onClick={closeRemoveDialog}
                  disabled={removing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="tpa-btn tpp-btn-danger-solid"
                  onClick={() => void confirmRemoveDevice()}
                  disabled={removing}
                >
                  {removing ? "Removing…" : "Remove device"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default DeviceDetails;
