// file-activity-page: v6
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getAgents, type Agent } from "../api";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/+$/, "");

/* =========================================================
   TYPES (match GET /api/v1/security/files/*)
   ========================================================= */

type FileEventItem = {
  id: number;
  event_type: string;
  occurred_at: string;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  sha256: string | null;
  source_url: string | null;
  source_domain: string | null;
  referrer_url: string | null;
  mime_type: string | null;
  browser: string | null;
  download_state: string | null;
  browser_flagged: boolean;
  danger_type: number | null;
  zone_id: number | null;
  drive_letter: string | null;
  volume_label: string | null;
  volume_serial: string | null;
  fs_type: string | null;
  domain_category: string | null;
  domain_category_label: string | null;
  domain_risk: string | null;
  domain_reason: string | null;
  risky_file_type: boolean;

  // Only in the all-devices view.
  device_id?: string;
  hostname?: string | null;
  display_name?: string | null;
};

type Summary = {
  total: number;
  by_type: Record<string, number>;
  browser_flagged: number;
  devices_with_usb_activity?: number;
};

type OverviewResponse = {
  hours: number;
  summary: Summary;
  top_domains: { domain: string; events: number }[];
  events: FileEventItem[];
};

type DeviceResponse = {
  device_id: string;
  hours: number;
  summary: Summary;
  total: number;
  limit: number;
  offset: number;
  events: FileEventItem[];
};

type FilterKey = "all" | "downloads" | "usb" | "attention";

type Flag = {
  key: string;
  label: string;
  level: "high" | "medium" | "info";
  hint?: string;
};

type FileActivityProps = {
  token: string;
};

/* =========================================================
   CONSTANTS AND HELPERS
   ========================================================= */

const RANGES = [
  { hours: 24, label: "Last 24 hours" },
  { hours: 24 * 7, label: "Last 7 days" },
  { hours: 24 * 30, label: "Last 30 days" },
  { hours: 24 * 90, label: "Last 90 days" },
];

const MAX_EVENTS = 500;
const REFRESH_MS = 60_000;

const DOWNLOAD_TYPES = new Set(["browser_download", "file_downloaded"]);
const USB_TYPES = new Set(["usb_inserted", "usb_removed", "usb_file_written"]);

async function request<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const body = await response.json();

      if (typeof body.detail === "string") {
        message = body.detail;
      }
    } catch {
      // Keep the default message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function formatSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeEvent(event: FileEventItem): {
  label: string;
  detail: string | null;
} {
  switch (event.event_type) {
    case "browser_download":
      return { label: "Downloaded", detail: event.browser };
    case "file_downloaded":
      return { label: "Downloaded", detail: "other app" };
    case "usb_inserted":
      return { label: "USB plugged in", detail: null };
    case "usb_removed":
      return { label: "USB removed", detail: null };
    case "usb_file_written":
      return { label: "Copied to USB", detail: null };
    default:
      return { label: event.event_type, detail: null };
  }
}

function describeDrive(event: FileEventItem): string {
  const parts = [
    event.drive_letter,
    event.volume_label,
    event.fs_type,
  ].filter((part): part is string => Boolean(part));

  return parts.join(" · ");
}

// What the browser (Chrome / Edge) itself said about a download. Many
// downloads carry a code only because they are uncommon, so only the
// serious ones count as "needs attention".
function browserReason(
  dangerType: number | null,
): { label: string; level: Flag["level"] } | null {
  switch (dangerType) {
    case 1:
      return { label: "Dangerous file type", level: "high" };
    case 2:
      return { label: "Dangerous site", level: "high" };
    case 3:
      return { label: "Dangerous content", level: "high" };
    case 4:
      return { label: "Browser unsure", level: "info" };
    case 5:
      return { label: "Uncommon download", level: "info" };
    case 6:
      return { label: "Kept after warning", level: "medium" };
    case 7:
      return { label: "Dangerous host", level: "high" };
    case 8:
      return { label: "Unwanted software", level: "high" };
    default:
      return null;
  }
}

function getFlags(event: FileEventItem): Flag[] {
  const flags: Flag[] = [];

  const reason = browserReason(event.danger_type);

  if (reason) {
    flags.push({
      key: "browser",
      label: reason.label,
      level: reason.level,
      hint: `Browser reason code ${event.danger_type}`,
    });
  } else if (event.browser_flagged) {
    flags.push({ key: "browser", label: "Browser warned", level: "high" });
  }

  if (event.domain_risk === "risky") {
    flags.push({ key: "site", label: "Risky site", level: "high" });
  }

  if (event.risky_file_type) {
    flags.push({ key: "type", label: "Program or script", level: "medium" });
  }

  if (event.domain_risk === "unnecessary") {
    flags.push({ key: "work", label: "Non-work site", level: "info" });
  }

  return flags;
}

function needsAttention(event: FileEventItem): boolean {
  return getFlags(event).some(
    (flag) => flag.level === "high" || flag.level === "medium",
  );
}

function deviceName(event: FileEventItem): string {
  return event.display_name || event.hostname || event.device_id || "Unknown";
}

/* =========================================================
   COMPONENT
   ========================================================= */

function FileActivity({ token }: FileActivityProps) {
  const [hours, setHours] = useState(24 * 7);
  const [deviceId, setDeviceId] = useState("all");
  const [filter, setFilter] = useState<FilterKey>("all");

  const [agents, setAgents] = useState<Agent[]>([]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [device, setDevice] = useState<DeviceResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);

  const requestCounter = useRef(0);
  const copyTimer = useRef<number | null>(null);

  /* ---------------- device list (for the picker) ---------------- */

  useEffect(() => {
    let cancelled = false;

    getAgents(token)
      .then((list) => {
        if (!cancelled) {
          setAgents(list);
        }
      })
      .catch(() => {
        // The picker is optional; "All devices" still works.
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  /* ---------------- how long activity is kept (optional) ---------------- */

  useEffect(() => {
    let cancelled = false;

    request<{ cleanup: { enabled: boolean; retention_days: number } }>(
      token,
      "/api/v1/security/files/maintenance/status",
    )
      .then((status) => {
        if (!cancelled && status.cleanup.enabled) {
          setRetentionDays(status.cleanup.retention_days);
        }
      })
      .catch(() => {
        // Older backend or no access: the page simply omits the note.
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  /* ---------------- file activity ---------------- */

  const load = useCallback(async () => {
    const requestId = ++requestCounter.current;

    setLoading(true);

    try {
      if (deviceId === "all") {
        const data = await request<OverviewResponse>(
          token,
          `/api/v1/security/files/overview?hours=${hours}&limit=${MAX_EVENTS}`,
        );

        if (requestId !== requestCounter.current) {
          return;
        }

        setOverview(data);
        setDevice(null);
      } else {
        const data = await request<DeviceResponse>(
          token,
          `/api/v1/security/files/devices/${encodeURIComponent(deviceId)}/events` +
            `?hours=${hours}&limit=${MAX_EVENTS}`,
        );

        if (requestId !== requestCounter.current) {
          return;
        }

        setDevice(data);
        setOverview(null);
      }

      setError(null);
      setUpdatedAt(new Date());
    } catch (requestError) {
      if (requestId !== requestCounter.current) {
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load file activity.",
      );
    } finally {
      if (requestId === requestCounter.current) {
        setLoading(false);
      }
    }
  }, [token, hours, deviceId]);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      window.clearInterval(timer);

      // Anything still in flight is ignored after this point.
      requestCounter.current += 1;
    };
  }, [load]);

  useEffect(() => {
    return () => {
      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }
    };
  }, []);

  /* ---------------- derived data ---------------- */

  const showingAll = deviceId === "all";
  const events = useMemo(
    () => (showingAll ? overview?.events : device?.events) ?? [],
    [showingAll, overview, device],
  );
  const summary = showingAll ? overview?.summary : device?.summary;
  const totalInRange = summary?.total ?? 0;

  const counts = useMemo(() => {
    let downloads = 0;
    let usb = 0;
    let attention = 0;

    for (const event of events) {
      if (DOWNLOAD_TYPES.has(event.event_type)) {
        downloads += 1;
      }

      if (USB_TYPES.has(event.event_type)) {
        usb += 1;
      }

      if (needsAttention(event)) {
        attention += 1;
      }
    }

    return { all: events.length, downloads, usb, attention };
  }, [events]);

  const visible = useMemo(() => {
    switch (filter) {
      case "downloads":
        return events.filter((e) => DOWNLOAD_TYPES.has(e.event_type));
      case "usb":
        return events.filter((e) => USB_TYPES.has(e.event_type));
      case "attention":
        return events.filter(needsAttention);
      default:
        return events;
    }
  }, [events, filter]);

  const downloadsInRange =
    (summary?.by_type.browser_download ?? 0) +
    (summary?.by_type.file_downloaded ?? 0);

  const usbInRange =
    (summary?.by_type.usb_inserted ?? 0) +
    (summary?.by_type.usb_removed ?? 0) +
    (summary?.by_type.usb_file_written ?? 0);

  const hasData = (showingAll ? overview : device) !== null;
  const truncated = totalInRange > events.length;

  /* ---------------- actions ---------------- */

  const copyHash = (hash: string) => {
    void navigator.clipboard?.writeText(hash);

    setCopiedHash(hash);

    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }

    copyTimer.current = window.setTimeout(() => {
      setCopiedHash(null);
    }, 1500);
  };

  /* ---------------- render ---------------- */

  const filterButtons: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Everything" },
    { key: "downloads", label: "Downloads" },
    { key: "usb", label: "USB drives" },
    { key: "attention", label: "Needs attention" },
  ];

  return (
    <section className="fa-page">
      <style>{STYLES}</style>

      <header className="fa-header">
        <div className="fa-controls">
          <label className="fa-field">
            <span>Device</span>
            <select
              aria-label="Device"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
            >
              <option value="all">All devices</option>
              {agents.map((agent) => (
                <option key={agent.device_id} value={agent.device_id}>
                  {agent.hostname}
                </option>
              ))}
            </select>
          </label>

          <label className="fa-field">
            <span>Time range</span>
            <select
              aria-label="Time range"
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            >
              {RANGES.map((range) => (
                <option key={range.hours} value={range.hours}>
                  {range.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="fa-refresh"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && (
        <div className="fa-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      )}

      <div className="fa-cards">
        <article className="fa-card">
          <span className="fa-card-label">Total activity</span>
          <strong>{totalInRange}</strong>
          <small>events in this time range</small>
        </article>

        <article className="fa-card">
          <span className="fa-card-label">Files downloaded</span>
          <strong>{downloadsInRange}</strong>
          <small>from browsers and other apps</small>
        </article>

        <article className="fa-card">
          <span className="fa-card-label">USB activity</span>
          <strong>{usbInRange}</strong>
          <small>
            {showingAll && summary?.devices_with_usb_activity !== undefined
              ? `${summary.devices_with_usb_activity} device${
                  summary.devices_with_usb_activity === 1 ? "" : "s"
                } involved`
              : "drives plugged in, removed or written to"}
          </small>
        </article>

        <article
          className={`fa-card${counts.attention > 0 ? " fa-card-alert" : ""}`}
        >
          <span className="fa-card-label">Needs attention</span>
          <strong>{counts.attention}</strong>
          <small>risky sites, warnings, programs or scripts</small>
        </article>
      </div>

      <div className={`fa-layout${showingAll ? " fa-layout-wide" : ""}`}>
        <div className="fa-panel">
          <div className="fa-panel-head">
            <div className="fa-chips" role="group" aria-label="Filter">
              {filterButtons.map((button) => (
                <button
                  key={button.key}
                  type="button"
                  className={`fa-chip${filter === button.key ? " active" : ""}`}
                  aria-pressed={filter === button.key}
                  onClick={() => setFilter(button.key)}
                >
                  {button.label}
                  <span>{counts[button.key]}</span>
                </button>
              ))}
            </div>

            <span className="fa-updated">
              {updatedAt
                ? `Updated ${updatedAt.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
            </span>
          </div>

          {!hasData && loading && (
            <p className="fa-empty">Loading file activity…</p>
          )}

          {hasData && events.length === 0 && !error && (
            <p className="fa-empty">
              No file activity in this time range yet. Downloads and USB events
              show up within a minute or two once a PC runs agent 1.5.0 or newer.
            </p>
          )}

          {events.length > 0 && visible.length === 0 && (
            <p className="fa-empty">
              Nothing matches this filter in the events shown.
            </p>
          )}

          {visible.length > 0 && (
            <div className="fa-table-wrap">
              <table className="fa-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What happened</th>
                    <th>File</th>
                    <th>From</th>
                    <th>Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {visible.map((event) => {
                    const flags = getFlags(event);
                    const isDrive = event.event_type.startsWith("usb_") &&
                      event.event_type !== "usb_file_written";

                    return (
                      <tr key={event.id}>
                        <td className="fa-nowrap">
                          <span>{formatWhen(event.occurred_at)}</span>
                          {showingAll && (
                            <small className="fa-category">
                              {deviceName(event)}
                            </small>
                          )}
                        </td>

                        <td>
                          <span>{describeEvent(event).label}</span>
                          {describeEvent(event).detail && (
                            <small className="fa-category">
                              {describeEvent(event).detail}
                            </small>
                          )}
                        </td>

                        <td className="fa-file">
                          {isDrive ? (
                            <span>{describeDrive(event) || "USB drive"}</span>
                          ) : (
                            <>
                              <span
                                className="fa-file-name"
                                title={event.file_path ?? undefined}
                              >
                                {event.file_name ?? "Unnamed file"}
                              </span>

                              <small className="fa-category">
                                <span>{formatSize(event.file_size)}</span>
                                {event.sha256 && (
                                  <>
                                    {" · "}
                                    <button
                                      type="button"
                                      className="fa-hash"
                                      title={`SHA-256: ${event.sha256} (click to copy)`}
                                      onClick={() => copyHash(event.sha256 as string)}
                                    >
                                      {copiedHash === event.sha256
                                        ? "Copied"
                                        : `${event.sha256.slice(0, 10)}…`}
                                    </button>
                                  </>
                                )}
                              </small>
                            </>
                          )}
                        </td>

                        <td>
                          {event.event_type === "usb_file_written" ? (
                            <span>{describeDrive(event)}</span>
                          ) : event.source_domain ? (
                            <span title={event.source_url ?? undefined}>
                              {event.source_domain}
                              {event.domain_category_label && (
                                <small className="fa-category">
                                  {event.domain_category_label}
                                </small>
                              )}
                            </span>
                          ) : (
                            <span className="fa-muted">—</span>
                          )}
                        </td>

                        <td>
                          <div className="fa-flags">
                            {flags.length === 0 && (
                              <span className="fa-muted">—</span>
                            )}

                            {flags.map((flag) => (
                              <span
                                key={flag.key}
                                className={`fa-flag fa-flag-${flag.level}`}
                                title={flag.hint}
                              >
                                {flag.label}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {truncated && (
            <p className="fa-note">
              Showing the latest {events.length} of {totalInRange} events. Pick
              a device or a shorter time range to see the rest.
            </p>
          )}

          {retentionDays !== null && (
            <p className="fa-note">
              Activity older than {retentionDays} days is removed
              automatically.
            </p>
          )}
        </div>

        {showingAll && overview && (
          <aside className="fa-panel fa-side">
            <h2>Most common sources</h2>

            {overview.top_domains.length === 0 ? (
              <p className="fa-empty">No downloads from websites yet.</p>
            ) : (
              <ol className="fa-domains">
                {overview.top_domains.map((item) => (
                  <li key={item.domain}>
                    <span>{item.domain}</span>
                    <strong>{item.events}</strong>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        )}
      </div>
    </section>
  );
}

/* =========================================================
   STYLES (scoped with the fa- prefix; uses the app's theme
   variables, with fallbacks)
   ========================================================= */

const STYLES = `
.fa-page { --fa-card: #111a24; --fa-field: #0b1118; --fa-border: #1e2b3a; --fa-soft: #9aa8b6; --fa-muted: #6b7a8a; --fa-accent: #3fc28f; --fa-amber: #e9b44c; --fa-red: #ff6b81; display: flex; flex-direction: column; gap: 20px; color: inherit; }
.fa-header { display: flex; flex-wrap: wrap; justify-content: flex-end; }
.fa-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.fa-field { display: flex; flex-direction: column; gap: 6px; font-size: 0.74rem; color: var(--fa-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.fa-field select { min-width: 170px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--fa-border); background: var(--fa-field); color: inherit; font: inherit; font-size: 0.9rem; text-transform: none; letter-spacing: 0; }
.fa-refresh { padding: 9px 16px; border-radius: 10px; border: 1px solid rgba(63,194,143,0.45); background: rgba(63,194,143,0.1); color: var(--fa-accent); font: inherit; font-size: 0.9rem; cursor: pointer; }
.fa-refresh:disabled { opacity: 0.6; cursor: default; }
.fa-error { display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 12px; border: 1px solid rgba(255,107,129,0.45); background: rgba(255,107,129,0.1); color: #ffc2cc; }
.fa-error button { padding: 6px 12px; border-radius: 8px; border: 1px solid rgba(255,107,129,0.5); background: transparent; color: inherit; font: inherit; cursor: pointer; }
.fa-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.fa-card { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px; border-radius: 16px; border: 1px solid var(--fa-border); background: var(--fa-card); }
.fa-card strong { font-size: 1.9rem; font-weight: 650; line-height: 1.1; }
.fa-card small { color: var(--fa-muted); font-size: 0.78rem; }
.fa-card-label { color: var(--fa-soft); font-size: 0.8rem; }
.fa-card-alert { border-color: rgba(233,180,76,0.45); }
.fa-card-alert strong { color: var(--fa-amber); }
.fa-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
.fa-layout-wide { grid-template-columns: minmax(0, 1fr) 280px; }
@media (max-width: 1500px) { .fa-layout-wide { grid-template-columns: minmax(0, 1fr); } }
.fa-panel { padding: 16px; border-radius: 16px; border: 1px solid var(--fa-border); background: var(--fa-card); min-width: 0; }
.fa-panel-head { display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.fa-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.fa-chip { display: inline-flex; gap: 8px; align-items: center; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--fa-border); background: transparent; color: var(--fa-soft); font: inherit; font-size: 0.85rem; cursor: pointer; }
.fa-chip span { padding: 1px 7px; border-radius: 999px; background: rgba(154,168,182,0.14); font-size: 0.75rem; }
.fa-chip.active { color: inherit; border-color: rgba(63,194,143,0.5); background: rgba(63,194,143,0.12); }
.fa-updated { color: var(--fa-muted); font-size: 0.78rem; }
.fa-table-wrap { overflow-x: auto; }
.fa-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
.fa-table th { text-align: left; padding: 8px; color: var(--fa-soft); font-weight: 500; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--fa-border); white-space: nowrap; }
.fa-table td { padding: 9px 8px; border-bottom: 1px solid rgba(30,43,58,0.7); vertical-align: top; }
.fa-nowrap { white-space: nowrap; }
.fa-table td { overflow-wrap: anywhere; }
.fa-file { max-width: 240px; }
.fa-file-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 230px; }
.fa-hash { margin: 0; padding: 0; border: 0; background: none; color: var(--fa-muted); font-family: ui-monospace, Consolas, monospace; font-size: 0.72rem; cursor: pointer; }
.fa-hash:hover { color: var(--fa-accent); }
.fa-category { display: block; color: var(--fa-muted); font-size: 0.74rem; }
.fa-muted { color: var(--fa-muted); }
.fa-flags { display: flex; flex-wrap: wrap; gap: 6px; }
.fa-flag { padding: 2px 9px; border-radius: 999px; font-size: 0.74rem; }
.fa-flag-high { background: rgba(255,107,129,0.14); color: #ff8fa0; border: 1px solid rgba(255,107,129,0.4); }
.fa-flag-medium { background: rgba(233,180,76,0.14); color: var(--fa-amber); border: 1px solid rgba(233,180,76,0.4); }
.fa-flag-info { background: rgba(154,168,182,0.12); color: var(--fa-soft); border: 1px solid var(--fa-border); }
.fa-empty { margin: 18px 4px; color: var(--fa-soft); line-height: 1.5; }
.fa-note { margin: 12px 4px 0; color: var(--fa-muted); font-size: 0.8rem; }
.fa-side h2 { margin: 0 0 12px; font-size: 0.95rem; font-weight: 600; }
.fa-domains { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
.fa-domains li { display: flex; justify-content: space-between; gap: 10px; font-size: 0.86rem; }
.fa-domains span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fa-soft); }
`;

export default FileActivity;
