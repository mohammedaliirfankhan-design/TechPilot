import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { devices, type DeviceStatus } from "../data/mockData";
import ScrollReveal from "../components/ScrollReveal";

type DeviceDetailsProps = {
  deviceId: string;
  onBack: () => void;
};

function DeviceDetails({
  deviceId,
  onBack,
}: DeviceDetailsProps) {
  const device = useMemo(
    () =>
      devices.find(
        (item) => item.id === deviceId,
      ),
    [deviceId],
  );

  const [activeResource, setActiveResource] =
    useState<
      "cpu" | "ram" | "disk" | null
    >(null);

  if (!device) {
    return (
      <section className="glass-card device-details-empty futuristic-empty-state">
        <div className="empty-icon">⌕</div>

        <strong>Device not found</strong>

        <p>
          The selected device could not be
          found in the current device
          inventory.
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

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100 -
          (device.cpuUsage * 0.2 +
            device.ramUsage * 0.15 +
            device.diskUsage * 0.15),
      ),
    ),
  );

  return (
    <div className="device-details-layout futuristic-device-details device-details-scroll-experience">
      {/* =====================================================
          DEVICE DETAIL SCROLL RAIL
          ===================================================== */}

      <div className="device-details-scroll-rail" aria-hidden="true">
        <span className="device-scroll-line" />
        <span className="device-scroll-dot dot-one" />
        <span className="device-scroll-dot dot-two" />
        <span className="device-scroll-dot dot-three" />
        <span className="device-scroll-dot dot-four" />
        <span className="device-scroll-dot dot-five" />
        <span className="device-scroll-dot dot-six" />
      </div>

      {/* =====================================================
          BACK BUTTON
          ===================================================== */}

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

      {/* =====================================================
          DEVICE COMMAND HEADER
          ===================================================== */}

      <ScrollReveal delay={40}>
        <section className="glass-card device-details-header futuristic-device-header device-3d-panel">
          <div className="device-details-identity">
            <div className="device-details-icon futuristic-device-details-icon">
              <span>▣</span>
              <i />
            </div>

            <div>
              <span className="eyebrow">
                MANAGED ENDPOINT // DEVICE
              </span>

              <h2>{device.name}</h2>

              <p>
                {device.os} · {device.user}
              </p>

              <div className="device-header-meta">
                <span>
                  ID {device.id}
                </span>

                <span>
                  HOST {device.hostname}
                </span>

                <span>
                  AGENT {device.agentVersion}
                </span>
              </div>
            </div>
          </div>

          <div className="device-details-status futuristic-device-status">
            <StatusBadge
              value={device.status}
            />

            <div className="device-heartbeat">
              <i />
              <span>
                Last seen {device.lastSeen}
              </span>
            </div>

            <div className="device-header-health">
              <span>HEALTH SCORE</span>
              <strong>
                {healthScore}%
              </strong>
            </div>
          </div>

          <div className="device-header-scan" />
        </section>
      </ScrollReveal>

      {/* =====================================================
          MACHINE INFORMATION
          ===================================================== */}

      <ScrollReveal delay={80}>
        <section className="glass-card device-details-card futuristic-details-card device-3d-section">
          <DetailsHeading
            eyebrow="DEVICE IDENTITY"
            title="Machine Information"
            code="IDENTITY"
          />

          <div className="details-grid futuristic-details-grid">
            <DetailItem
              label="Hostname"
              value={device.hostname}
            />

            <DetailItem
              label="Machine ID"
              value={device.machineId}
            />

            <DetailItem
              label="IP Address"
              value={device.ipAddress}
            />

            <DetailItem
              label="MAC Address"
              value={device.macAddress}
            />

            <DetailItem
              label="Operating System"
              value={device.os}
            />

            <DetailItem
              label="OS Version"
              value={device.osVersion}
            />

            <DetailItem
              label="Architecture"
              value={device.architecture}
            />

            <DetailItem
              label="Assigned User"
              value={device.user}
            />

            <DetailItem
              label="Device ID"
              value={device.id}
            />
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          TECHPILOT AGENT
          ===================================================== */}

      <ScrollReveal delay={120}>
        <section className="glass-card device-details-card futuristic-details-card device-3d-section">
          <DetailsHeading
            eyebrow="TECHPILOT AGENT"
            title="Agent Information"
            code="AGENT"
          />

          <div className="details-grid futuristic-details-grid agent-details-grid">
            <DetailItem
              label="Agent Version"
              value={device.agentVersion}
            />

            <DetailItem
              label="Agent Status"
              value={device.agentStatus}
              status
            />

            <DetailItem
              label="Last Heartbeat"
              value={device.lastHeartbeat}
            />
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          SYSTEM STATUS
          ===================================================== */}

      <ScrollReveal delay={160}>
        <section className="glass-card device-details-card futuristic-details-card device-3d-section">
          <DetailsHeading
            eyebrow="SYSTEM STATUS"
            title="Operating Status"
            code="STATUS"
          />

          <div className="details-grid futuristic-details-grid">
            <DetailItem
              label="Uptime"
              value={device.uptime}
            />

            <DetailItem
              label="Boot Time"
              value={device.bootTime}
            />

            <DetailItem
              label="Network Status"
              value={device.networkStatus}
              status
            />
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          NETWORK INFORMATION
          ===================================================== */}

      <ScrollReveal delay={200}>
        <section className="glass-card device-details-card futuristic-details-card device-3d-section">
          <DetailsHeading
            eyebrow="NETWORK INFORMATION"
            title="Network Details"
            code="NETWORK"
          />

          <div className="details-grid futuristic-details-grid network-details-grid">
            <DetailItem
              label="Network Interface"
              value={device.networkInterface}
            />

            <DetailItem
              label="Connection Status"
              value={device.networkStatus}
              status
            />

            <DetailItem
              label="Download Speed"
              value={device.downloadSpeed}
            />

            <DetailItem
              label="Upload Speed"
              value={device.uploadSpeed}
            />

            <DetailItem
              label="IP Address"
              value={device.ipAddress}
            />

            <DetailItem
              label="MAC Address"
              value={device.macAddress}
            />
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          SECURITY & RISK
          ===================================================== */}

      <ScrollReveal delay={240}>
        <section className="glass-card device-details-card futuristic-details-card security-panel">
          <DetailsHeading
            eyebrow="SECURITY & RISK"
            title="Endpoint Security"
            code=""
          />

          <div
            className="security-details-grid futuristic-security-grid"
            style={{
              "--security-columns":
                "repeat(4, minmax(0, 1fr))",
            } as CSSProperties}
          >
            <DetailItem
              label="Security Status"
              value={device.securityStatus}
              status
            />

            <DetailItem
              label="Firewall"
              value={device.firewallStatus}
              status
            />

            <DetailItem
              label="Antivirus"
              value={device.antivirusStatus}
              status
            />

            <DetailItem
              label="Pending Updates"
              value={`${device.pendingUpdates} pending`}
            />
          </div>
        </section>
      </ScrollReveal>

      {/* =====================================================
          RESOURCE OVERVIEW
          ===================================================== */}

      <ScrollReveal delay={280}>
        <section className="device-resource-grid futuristic-resource-grid device-3d-section">
          <ResourceCard
            label="CPU"
            usage={device.cpuUsage}
            active={
              activeResource === "cpu"
            }
            onFocus={() =>
              setActiveResource("cpu")
            }
            model={device.cpuModel}
            details={[
              [
                "Cores",
                String(device.cpuCores),
              ],
              [
                "Frequency",
                device.cpuFrequency,
              ],
            ]}
          />

          <ResourceCard
            label="RAM"
            usage={device.ramUsage}
            active={
              activeResource === "ram"
            }
            onFocus={() =>
              setActiveResource("ram")
            }
            details={[
              [
                "Total",
                device.ramTotal,
              ],
              [
                "Used",
                device.ramUsed,
              ],
              [
                "Available",
                device.ramAvailable,
              ],
            ]}
          />

          <ResourceCard
            label="DISK"
            usage={device.diskUsage}
            active={
              activeResource === "disk"
            }
            onFocus={() =>
              setActiveResource("disk")
            }
            details={[
              [
                "Total",
                device.diskTotal,
              ],
              [
                "Used",
                device.diskUsed,
              ],
              [
                "Available",
                device.diskAvailable,
              ],
            ]}
          />
        </section>
      </ScrollReveal>
    </div>
  );
}

/* =========================================================
   DETAILS HEADING
   ========================================================= */

function DetailsHeading({
  eyebrow,
  title,
  code,
  trailing,
}: {
  eyebrow: string;
  title: string;
  code: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="details-card-heading futuristic-details-heading">
      <div className="details-heading-copy">
        <span className="eyebrow">
          {eyebrow}
        </span>

        <h3>{title}</h3>
      </div>

      <div className="details-heading-right">
        {code && (
          <span className="details-section-code">
            {code}
          </span>
        )}

        {trailing}
      </div>
    </div>
  );
}

/* =========================================================
   DETAIL ITEM
   ========================================================= */

function DetailItem({
  label,
  value,
  status = false,
}: {
  label: string;
  value: string;
  status?: boolean;
}) {
  return (
    <div
      className={`detail-item futuristic-detail-item ${
        status
          ? "detail-item-status"
          : ""
      }`}
    >
      <span>{label}</span>

      <strong>{value}</strong>

      {status && (
        <i
          className="detail-status-indicator"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/* =========================================================
   RESOURCE CARD
   ========================================================= */

function ResourceCard({
  label,
  usage,
  active,
  onFocus,
  model,
  details,
}: {
  label: string;
  usage: number;
  active: boolean;
  onFocus: () => void;
  model?: string;
  details: Array<
    [string, string]
  >;
}) {
  const tone =
    usage >= 90
      ? "critical"
      : usage >= 75
        ? "warning"
        : "normal";

  return (
    <section
      className={`glass-card resource-card futuristic-resource-card ${tone} ${
        active
          ? "resource-card-active"
          : ""
      }`}
      onMouseEnter={onFocus}
      onFocus={onFocus}
      tabIndex={0}
    >
      <div className="resource-heading">
        <div>
          <span>{label}</span>

          <small>
            RESOURCE TELEMETRY
          </small>
        </div>

        <strong>{usage}%</strong>
      </div>

      <div className="resource-orbit">
        <div className="resource-orbit-ring" />

        <div
          className="resource-orbit-value"
          style={{
            "--resource-progress": `${usage}%`,
          } as CSSProperties}
        >
          <span>
            {usage}%
          </span>
        </div>
      </div>

      <div className="resource-bar futuristic-resource-bar">
        <span
          style={{
            width: `${usage}%`,
          }}
        />

        <i
          style={{
            left: `${usage}%`,
          }}
        />
      </div>

      {model && (
        <div className="resource-model">
          {model}
        </div>
      )}

      <div className="resource-details futuristic-resource-details">
        {details.map(
          ([detailLabel, value]) => (
            <DetailItem
              key={detailLabel}
              label={detailLabel}
              value={value}
            />
          ),
        )}
      </div>

      <div className="resource-corner">
        <span />
        <span />
      </div>
    </section>
  );
}

/* =========================================================
   STATUS BADGE
   ========================================================= */

function StatusBadge({
  value,
}: {
  value: DeviceStatus;
}) {
  return (
    <span
      className={`badge futuristic-status-badge ${value.toLowerCase()}`}
    >
      <i />
      <span>{value}</span>
    </span>
  );
}

/* =========================================================
   SECURITY BADGE
   ========================================================= */

function SecurityBadge({
  value,
}: {
  value: string;
}) {
  return (
    <span
      className={`badge futuristic-security-badge security-${value
        .toLowerCase()
        .replace(/\s+/g, "-")}`}
    >
      <i />
      <span>{value}</span>
    </span>
  );
}

export default DeviceDetails;