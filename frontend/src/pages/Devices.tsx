import { useMemo, useState } from "react";

import CardHeader from "../components/CardHeader";
import ScrollReveal from "../components/ScrollReveal";
import {
  devices,
  type DeviceStatus,
  type RiskLevel,
} from "../data/mockData";

type DevicesProps = {
  searchQuery?: string;
  onDeviceSelect?: (deviceId: string) => void;
};

type Filter = "All" | DeviceStatus;

function Devices({
  searchQuery = "",
  onDeviceSelect,
}: DevicesProps) {
  const [filter, setFilter] =
    useState<Filter>("All");

  const filteredDevices = useMemo(() => {
    const query =
      searchQuery.toLowerCase().trim();

    return devices.filter((device) => {
      const matchesFilter =
        filter === "All" ||
        device.status === filter;

      const matchesSearch =
        !query ||
        `${device.name} ${device.user} ${device.os} ${device.id} ${device.cpuModel} ${device.ipAddress} ${device.hostname}`
          .toLowerCase()
          .includes(query);

      return (
        matchesFilter &&
        matchesSearch
      );
    });
  }, [filter, searchQuery]);

  const healthyCount = devices.filter(
    (device) =>
      device.status === "Healthy",
  ).length;

  const warningCount = devices.filter(
    (device) =>
      device.status === "Warning",
  ).length;

  const offlineCount = devices.filter(
    (device) =>
      device.status === "Offline",
  ).length;

  return (
    <ScrollReveal
      className="devices-experience devices-scroll-experience devices-scroll-depth"
      delay={0}
    >
      <section className="glass-card table-card futuristic-devices-card devices-3d-panel">
        {/* ===================================================
            DEVICE SCROLL RAIL
            =================================================== */}

        <div className="devices-scroll-rail" aria-hidden="true">
          <span className="devices-scroll-line" />
          <span className="devices-scroll-dot dot-one" />
          <span className="devices-scroll-dot dot-two" />
          <span className="devices-scroll-dot dot-three" />
          <span className="devices-scroll-dot dot-four" />
        </div>

        {/* ===================================================
            DEVICE COMMAND HEADER
            =================================================== */}

        <div className="devices-command-header">
          <CardHeader
            title="Managed Devices"
            subtitle={`${filteredDevices.length} endpoint${
              filteredDevices.length === 1
                ? ""
                : "s"
            } shown`}
            action="+ Add device"
          />

          <div className="devices-command-status">
            <span className="devices-command-live">
              <i />
              LIVE INVENTORY
            </span>

            <span className="devices-command-time">
              STREAM ACTIVE
            </span>
          </div>
        </div>

        {/* ===================================================
            DEVICE SUMMARY
            =================================================== */}

        <div
          className="device-summary-grid devices-3d-section"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "16px",
            margin: "24px 0 22px",
            alignItems: "stretch",
          }}
        >
          <DeviceSummary
            label="TOTAL"
            value={devices.length}
            tone="blue"
          />

          <DeviceSummary
            label="HEALTHY"
            value={healthyCount}
            tone="green"
          />

          <DeviceSummary
            label="WARNING"
            value={warningCount}
            tone="yellow"
          />

          <DeviceSummary
            label="OFFLINE"
            value={offlineCount}
            tone="red"
          />
        </div>

        {/* ===================================================
            FILTER TOOLBAR
            =================================================== */}

        <div
          className="table-toolbar futuristic-table-toolbar devices-3d-section"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "28px",
            margin: "0 0 22px",
            padding: "14px 2px",
            minHeight: "58px",
          }}
        >
          <div
            className="filter-group"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            {(
              [
                "All",
                "Healthy",
                "Warning",
                "Offline",
              ] as Filter[]
            ).map((item) => (
              <button
                key={item}
                type="button"
                className={`filter-chip futuristic-filter-chip ${
                  filter === item
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setFilter(item)
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  minWidth: "72px",
                  minHeight: "38px",
                  padding: "8px 13px",
                  boxSizing: "border-box",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  className={`filter-dot ${
                    item.toLowerCase()
                  }`}
                />

                <span
                  style={{
                    lineHeight: 1,
                    fontWeight: 600,
                  }}
                >
                  {item}
                </span>

                <small
                  style={{
                    margin: 0,
                    lineHeight: 1,
                    fontWeight: 700,
                  }}
                >
                  {item === "All"
                    ? devices.length
                    : item === "Healthy"
                      ? healthyCount
                      : item === "Warning"
                        ? warningCount
                        : offlineCount}
                </small>
              </button>
            ))}
          </div>

          <div
            className="devices-toolbar-readout"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "12px",
              flex: "0 0 auto",
              whiteSpace: "nowrap",
              paddingLeft: "12px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              <i />
              <span style={{ letterSpacing: "0.08em" }}>
                MONITORING
              </span>
            </span>

            <strong
              style={{
                margin: 0,
                fontSize: "18px",
                lineHeight: 1,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
              }}
            >
              {filteredDevices.length
                .toString()
                .padStart(2, "0")}
              {" / "}
              {devices.length
                .toString()
                .padStart(2, "0")}
            </strong>
          </div>
        </div>

        {/* ===================================================
            DEVICE TABLE
            =================================================== */}

        <div className="table-wrap futuristic-table-wrap devices-3d-section">
          <table className="futuristic-device-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>User</th>
                <th>OS</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>Disk</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Last Seen</th>
              </tr>
            </thead>

            <tbody>
              {filteredDevices.map(
                (device, index) => (
                  <tr
                    key={device.id}
                    className="device-table-row"
                    style={{
                      "--row-index": index,
                    } as React.CSSProperties}
                  >
                    {/* DEVICE */}

                    <td>
                      <div className="device-cell futuristic-device-cell">
                        <div className="device-icon futuristic-device-icon">
                          <span>▣</span>
                          <i />
                        </div>

                        <div className="device-cell-copy">
                          <button
                            type="button"
                            className="device-name-button futuristic-device-name"
                            onClick={() =>
                              onDeviceSelect?.(
                                device.id,
                              )
                            }
                          >
                            {device.name}
                          </button>

                          <span>
                            {device.id}
                          </span>

                          <small>
                            {device.hostname}
                          </small>
                        </div>
                      </div>
                    </td>

                    {/* USER */}

                    <td>
                      <div className="device-user-cell">
                        <strong>
                          {device.user}
                        </strong>

                        <span>
                          ASSIGNED
                        </span>
                      </div>
                    </td>

                    {/* OPERATING SYSTEM */}

                    <td>
                      <div className="device-os-cell">
                        <strong>
                          {device.os}
                        </strong>

                        <span>
                          {device.osVersion}
                        </span>
                      </div>
                    </td>

                    {/* CPU */}

                    <td>
                      <TelemetryCell
                        value={`${device.cpuUsage}%`}
                        label="CPU LOAD"
                        detail={`${device.cpuCores} cores · ${device.cpuFrequency}`}
                        subdetail={
                          device.cpuModel
                        }
                        percentage={
                          device.cpuUsage
                        }
                        tone={getTelemetryTone(
                          device.cpuUsage,
                        )}
                      />
                    </td>

                    {/* RAM */}

                    <td>
                      <TelemetryCell
                        value={`${device.ramUsage}%`}
                        label="RAM LOAD"
                        detail={`${device.ramUsed} / ${device.ramTotal}`}
                        subdetail={`${device.ramAvailable} available`}
                        percentage={
                          device.ramUsage
                        }
                        tone={getTelemetryTone(
                          device.ramUsage,
                        )}
                      />
                    </td>

                    {/* DISK */}

                    <td>
                      <TelemetryCell
                        value={`${device.diskUsage}%`}
                        label="DISK LOAD"
                        detail={`${device.diskUsed} / ${device.diskTotal}`}
                        subdetail={`${device.diskAvailable} available`}
                        percentage={
                          device.diskUsage
                        }
                        tone={getTelemetryTone(
                          device.diskUsage,
                        )}
                      />
                    </td>

                    {/* STATUS */}

                    <td>
                      <StatusBadge
                        value={
                          device.status
                        }
                      />
                    </td>

                    {/* RISK */}

                    <td>
                      <RiskBadge
                        value={device.risk}
                      />
                    </td>

                    {/* LAST SEEN */}

                    <td>
                      <div className="last-seen-cell">
                        <span
                          className={`last-seen-dot ${
                            device.status.toLowerCase()
                          }`}
                        />

                        <span>
                          {device.lastSeen}
                        </span>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          {filteredDevices.length ===
            0 && (
            <div className="empty-state futuristic-empty-state">
              <div className="empty-icon">
                ⌕
              </div>

              <strong>
                No devices found
              </strong>

              <span>
                Try changing the filter or
                search query.
              </span>

              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setFilter("All");
                }}
              >
                Reset filters
              </button>
            </div>
          )}
        </div>

        {/* ===================================================
            TABLE FOOTER
            =================================================== */}

        <div
          className="devices-table-footer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "48px",
            marginTop: "22px",
            padding: "20px 24px 24px",
            minHeight: "72px",
            borderTop: "1px solid rgba(148, 163, 184, 0.10)",
            boxSizing: "border-box",
            lineHeight: 1.5,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              margin: 0,
              whiteSpace: "nowrap",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.12em",
              lineHeight: 1.4,
            }}
          >
            <i
              style={{
                width: "7px",
                height: "7px",
                flex: "0 0 7px",
                borderRadius: "50%",
                display: "inline-block",
              }}
            />
            ENDPOINT TELEMETRY SYNCHRONIZED
          </span>

          <span
            style={{
              display: "inline-flex",
              alignItems: "baseline",
              gap: "5px",
              margin: 0,
              whiteSpace: "nowrap",
              fontSize: "13px",
              fontWeight: 500,
              lineHeight: 1.5,
            }}
          >
            Showing
            <strong style={{ fontWeight: 700 }}>
              {filteredDevices.length}
            </strong>
            of
            <strong style={{ fontWeight: 700 }}>
              {devices.length}
            </strong>
            endpoints
          </span>
        </div>
      </section>
    </ScrollReveal>
  );
}

/* =========================================================
   DEVICE SUMMARY
   ========================================================= */

function DeviceSummary({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "yellow" | "red";
}) {
  return (
    <div
      className={`device-summary-card ${tone}`}
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: "8px",
        minHeight: "92px",
        padding: "18px 20px",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      <span
        style={{
          display: "block",
          margin: 0,
          fontSize: "11px",
          fontWeight: 700,
          lineHeight: 1.2,
          letterSpacing: "0.10em",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          margin: 0,
          fontSize: "28px",
          lineHeight: 1,
          fontWeight: 700,
        }}
      >
        {value
          .toString()
          .padStart(2, "0")}
      </strong>

      <i />
    </div>
  );
}

/* =========================================================
   TELEMETRY CELL
   ========================================================= */

function TelemetryCell({
  value,
  label,
  detail,
  subdetail,
  percentage,
  tone,
}: {
  value: string;
  label: string;
  detail: string;
  subdetail: string;
  percentage: number;
  tone: "normal" | "warning" | "critical";
}) {
  return (
    <div
      className={`telemetry-cell futuristic-telemetry-cell ${tone}`}
    >
      <div className="telemetry-heading">
        <strong>{value}</strong>

        <span>{label}</span>
      </div>

      <span className="telemetry-detail">
        {detail}
      </span>

      <small>{subdetail}</small>

      <div className="telemetry-bar futuristic-telemetry-bar">
        <span
          style={{
            width: `${percentage}%`,
          }}
        />

        <i
          style={{
            left: `${percentage}%`,
          }}
        />
      </div>
    </div>
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
   RISK BADGE
   ========================================================= */

function RiskBadge({
  value,
}: {
  value: RiskLevel;
}) {
  return (
    <span
      className={`badge futuristic-risk-badge ${value.toLowerCase()}`}
    >
      <i />

      <span>{value}</span>
    </span>
  );
}

/* =========================================================
   TELEMETRY TONE
   ========================================================= */

function getTelemetryTone(
  value: number,
): "normal" | "warning" | "critical" {
  if (value >= 90) {
    return "critical";
  }

  if (value >= 75) {
    return "warning";
  }

  return "normal";
}

export default Devices;