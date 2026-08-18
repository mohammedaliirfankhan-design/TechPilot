import { useState } from "react";
import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";

type SettingToggleProps = {
  title: string;
  description: string;
  enabled: boolean;
};

type SettingTone = "healthy" | "pending";

function Settings() {
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved"
  >("idle");

  const handleSave = () => {
    setSaveState("saving");

    window.setTimeout(() => {
      setSaveState("saved");

      window.setTimeout(() => {
        setSaveState("idle");
      }, 1800);
    }, 900);
  };

  return (
    <div className="settings-layout futuristic-settings">
      {/* =========================================================
          Settings Hero
          ========================================================= */}
      <ScrollReveal delay={0}>
        <section
          className="
            glass-card
            settings-hero
            futuristic-settings-hero
            settings-command-center
          "
        >
          <div className="settings-hero-grid" />

          <div className="settings-hero-copy settings-command-copy">
            <span className="eyebrow">
              SYSTEM CONFIGURATION // CONTROL
            </span>

            <h2>
              Workspace control
              <span> at the system layer.</span>
            </h2>

            <p>
              Configure TechPilot behavior, monitoring, notifications,
              security, and backend connectivity from one centralized
              control surface.
            </p>

            <div className="settings-hero-tags settings-command-tags">
              <span>CONFIGURATION READY</span>
              <span>POLICY CONTROLLED</span>
              <span>SECURE WORKSPACE</span>
            </div>
          </div>

          <div className="settings-core">
            <div className="settings-core-ring ring-one" />
            <div className="settings-core-ring ring-two" />
            <div className="settings-core-ring ring-three" />

            <div className="settings-core-value">
              <strong>SYS</strong>
              <span>ONLINE</span>
            </div>

            <i className="settings-core-pulse" />
          </div>

          <div className="settings-hero-readout settings-command-readout">
            <div>
              <span>WORKSPACE</span>
              <strong>ACTIVE</strong>
            </div>

            <div>
              <span>POLICIES</span>
              <strong>08</strong>
            </div>

            <div>
              <span>ACCESS</span>
              <strong>RBAC</strong>
            </div>
          </div>

          <div className="settings-hero-scan" />
        </section>
      </ScrollReveal>

      {/* =========================================================
          Workspace
          ========================================================= */}
      <ScrollReveal delay={60}>
        <section className="glass-card settings-card futuristic-settings-card">
          <CardHeader
            title="Workspace"
            subtitle="Manage your TechPilot workspace configuration."
            action={
              saveState === "saving"
                ? "Saving..."
                : saveState === "saved"
                  ? "Saved ✓"
                  : "Save changes"
            }
            onAction={handleSave}
          />

          <div className="settings-card-status">
            <span>
              <i />
              WORKSPACE CONFIGURATION
            </span>

            <strong>
              {saveState === "saved" ? "CHANGES APPLIED" : "READY"}
            </strong>
          </div>

          <div className="settings-section futuristic-settings-section">
            <div className="setting-field futuristic-setting-field">
              <label htmlFor="workspace-name">Workspace Name</label>

              <input
                id="workspace-name"
                type="text"
                defaultValue="TechPilot Operations"
              />

              <span className="field-signal">IDENTIFIER VALID</span>
            </div>

            <div className="setting-field futuristic-setting-field">
              <label htmlFor="workspace-description">Description</label>

              <textarea
                id="workspace-description"
                defaultValue="AI-powered IT operations workspace."
                rows={3}
              />

              <span className="field-signal">DESCRIPTION READY</span>
            </div>

            <div className="setting-row futuristic-setting-row">
              <div>
                <strong>Workspace status</strong>

                <span>Your TechPilot workspace is operational.</span>
              </div>

              <StatusBadge label="Operational" tone="healthy" />
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================================
          Platform
          ========================================================= */}
      <ScrollReveal delay={120}>
        <section className="glass-card settings-card futuristic-settings-card">
          <CardHeader
            title="Platform"
            subtitle="Configure core TechPilot platform behavior."
            action="Configuration"
          />

          <div className="settings-section futuristic-settings-section">
            <SettingToggle
              title="Device monitoring"
              description="Continuously monitor registered endpoints."
              enabled
            />

            <SettingToggle
              title="Automatic diagnostics"
              description="Run diagnostics when endpoint health issues are detected."
              enabled
            />

            <SettingToggle
              title="Governed automation"
              description="Allow approved remediation workflows to execute automatically."
              enabled
            />

            <SettingToggle
              title="Audit logging"
              description="Record administrative, security, and automation events."
              enabled
            />
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================================
          Notifications
          ========================================================= */}
      <ScrollReveal delay={180}>
        <section className="glass-card settings-card futuristic-settings-card">
          <CardHeader
            title="Notifications"
            subtitle="Control operational alerts and notifications."
            action="Notification settings"
          />

          <div className="settings-section futuristic-settings-section">
            <SettingToggle
              title="Critical incidents"
              description="Notify administrators when critical incidents are detected."
              enabled
            />

            <SettingToggle
              title="Device offline alerts"
              description="Notify when monitored devices become unavailable."
              enabled
            />

            <SettingToggle
              title="Automation approvals"
              description="Notify administrators when remediation requires approval."
              enabled
            />

            <SettingToggle
              title="Daily operations summary"
              description="Receive a daily summary of platform activity."
              enabled={false}
            />
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================================
          Backend Connection
          ========================================================= */}
      <ScrollReveal delay={240}>
        <section
          className="
            glass-card
            settings-card
            connection-card
            futuristic-connection-card
          "
        >
          <CardHeader
            title="Backend Connection"
            subtitle="API connectivity will be configured after the API contract is established."
            action="Not connected"
          />

          <div className="connection-status futuristic-connection-status">
            <div className="connection-visual">
              <div className="connection-icon">⌁</div>
              <i className="connection-pulse" />
            </div>

            <div className="connection-copy">
              <span className="eyebrow">API CONNECTION // PENDING</span>

              <strong>Backend not connected</strong>

              <p>
                TechPilot is currently running with mock data. Backend
                integration will be added after the API contract is finalized.
              </p>
            </div>

            <span className="pending-label futuristic-pending-label">
              Pending
            </span>
          </div>

          <div className="connection-pipeline">
            <ConnectionStep label="Frontend" state="complete" />
            <ConnectionConnector />

            <ConnectionStep label="API Contract" state="pending" />
            <ConnectionConnector />

            <ConnectionStep label="Backend" state="pending" />
            <ConnectionConnector />

            <ConnectionStep label="Live Data" state="pending" />
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================================
          Security
          ========================================================= */}
      <ScrollReveal delay={300}>
        <section className="glass-card settings-card futuristic-settings-card">
          <CardHeader
            title="Security"
            subtitle="Workspace security and access controls."
            action="Manage access"
          />

          <div className="security-grid futuristic-security-grid">
            <SecurityItem
              title="Authentication"
              value="Configured"
              tone="healthy"
            />

            <SecurityItem
              title="Role-based access"
              value="Enabled"
              tone="healthy"
            />

            <SecurityItem
              title="Audit logging"
              value="Active"
              tone="healthy"
            />

            <SecurityItem
              title="API integration"
              value="Pending"
              tone="pending"
            />
          </div>

          <div className="security-footer">
            <span>
              <i />
              SECURITY POSTURE
            </span>

            <strong>PROTECTED</strong>
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================================
          System Status
          ========================================================= */}
      <ScrollReveal delay={360}>
        <section className="glass-card settings-system-status">
          <div className="settings-system-icon">
            <span>✓</span>
            <i />
          </div>

          <div className="settings-system-copy">
            <span className="eyebrow">SYSTEM CONFIGURATION</span>

            <strong>All current settings are locally applied</strong>

            <p>
              Changes remain within this frontend session until the backend API
              is connected.
            </p>
          </div>

          <div className="settings-system-readout">
            <span>
              <i />
              CONFIG ENGINE
            </span>

            <strong>READY</strong>
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
}

function SettingToggle({
  title,
  description,
  enabled,
}: SettingToggleProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);

  return (
    <div className="setting-toggle-row futuristic-setting-toggle-row">
      <div className="setting-toggle-copy">
        <div>
          <strong>{title}</strong>

          <span>{isEnabled ? "ACTIVE" : "DISABLED"}</span>
        </div>

        <p>{description}</p>
      </div>

      <button
        type="button"
        className={`toggle futuristic-toggle ${
          isEnabled ? "enabled" : ""
        }`}
        aria-pressed={isEnabled}
        aria-label={`${title}: ${isEnabled ? "enabled" : "disabled"}`}
        onClick={() => setIsEnabled((current) => !current)}
      >
        <span />
        <i />
      </button>
    </div>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: SettingTone;
}) {
  return (
    <span className={`badge futuristic-settings-badge ${tone}`}>
      <i />
      {label}
    </span>
  );
}

function SecurityItem({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: SettingTone;
}) {
  return (
    <div
      className={`security-item futuristic-security-item ${tone}`}
    >
      <div className="security-item-icon">
        {tone === "healthy" ? "✓" : "!"}
      </div>

      <div>
        <span>{title}</span>
        <strong className={tone}>{value}</strong>
      </div>

      <i className="security-item-signal" />
    </div>
  );
}

function ConnectionStep({
  label,
  state,
}: {
  label: string;
  state: "complete" | "pending";
}) {
  return (
    <div className={`connection-step ${state}`}>
      <div className="connection-step-node">
        {state === "complete" ? "✓" : "—"}
      </div>

      <span>{label}</span>
    </div>
  );
}

function ConnectionConnector() {
  return (
    <div className="connection-connector" aria-hidden="true">
      <span />
    </div>
  );
}

export default Settings;