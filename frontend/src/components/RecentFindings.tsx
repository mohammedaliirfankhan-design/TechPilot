// recent-findings-version: 1
import { useEffect, useState } from "react";

import { relativeTime } from "../pages/networkInsights";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/+$/, "");

const REFRESH_MS = 60_000;
const SHOWN = 6;

type Finding = {
  id: number;
  device_id: string;
  hostname?: string | null;
  display_name?: string | null;
  title: string;
  detail: string | null;
  occurred_at: string;
};

type FindingsResponse = {
  total: number;
  findings: Finding[];
};

type RecentFindingsProps = {
  token: string;
  // How many devices run an agent that reports downloads and USB activity,
  // out of all enrolled devices. Used to avoid a false "all clear".
  coveredDevices: number;
  totalDevices: number;
  onViewAll: () => void;
};

function deviceLabel(finding: Finding): string {
  return finding.display_name || finding.hostname || finding.device_id;
}

function RecentFindings({
  token,
  coveredDevices,
  totalDevices,
  onViewAll,
}: RecentFindingsProps) {
  const [report, setReport] = useState<FindingsResponse | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/security/files/findings?hours=168&limit=${SHOWN}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as FindingsResponse;

        if (!cancelled) {
          setReport(data);
          setNow(new Date());
        }
      } catch {
        // Keep whatever is already shown. This card is optional: an older
        // backend or a network hiccup must never disturb the Home page.
      }
    };

    void load();

    const timer = window.setInterval(() => {
      void load();
    }, REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  if (!report) {
    return null;
  }

  const shown = report.findings.slice(0, SHOWN);
  const more = report.total - shown.length;
  const partlyCovered = totalDevices > 0 && coveredDevices < totalDevices;

  // Nothing to show and no device that could have reported something.
  if (shown.length === 0 && coveredDevices === 0 && totalDevices === 0) {
    return null;
  }

  return (
    <section className="tph-card rf-card" aria-labelledby="rf-title">
      <style>{STYLES}</style>

      <div className="tph-card-head">
        <h2 id="rf-title">Recent findings</h2>
        <button type="button" className="tph-link" onClick={onViewAll}>
          Open Files &amp; downloads
        </button>
      </div>

      {shown.length > 0 ? (
        <ul className="rf-list">
          {shown.map((finding) => (
            <li key={finding.id}>
              <span className="rf-mark" aria-hidden="true">
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
                  <path d="M12 3l10 18H2zM12 10v4M12 17h.01" />
                </svg>
              </span>

              <div className="rf-body">
                <strong>{finding.title}</strong>

                {finding.detail && (
                  <span className="rf-detail">{finding.detail}</span>
                )}

                <small>
                  {deviceLabel(finding)} ·{" "}
                  {relativeTime(new Date(finding.occurred_at), now)}
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : coveredDevices > 0 ? (
        <p className="rf-clear">
          <span className="rf-ok" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          Nothing needs a look. No risky downloads or USB copies in the last 7
          days.
        </p>
      ) : (
        <p className="rf-note">
          No device reports downloads and USB activity yet. Update the agents
          to version 1.5.0 or newer.
        </p>
      )}

      {more > 0 && (
        <button type="button" className="tph-link rf-more" onClick={onViewAll}>
          {more === 1 ? "1 more finding" : `${more} more findings`}
        </button>
      )}

      {partlyCovered && coveredDevices > 0 && (
        <p className="rf-note">
          Only {coveredDevices} of {totalDevices} devices report downloads and
          USB activity. Update the others to agent 1.5.0 or newer to include
          them.
        </p>
      )}
    </section>
  );
}

export default RecentFindings;

/* Scoped styles; colours follow the console's dark theme. */
const STYLES = `
.rf-card .rf-list { margin: 14px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.rf-card .rf-list li { display: flex; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid #1e2b3a; background: rgba(0,0,0,0.18); }
.rf-card .rf-mark { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 10px; background: rgba(233,180,76,0.14); color: #e9b44c; }
.rf-card .rf-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
.rf-card .rf-detail { color: #9aa8b6; font-size: 0.88rem; line-height: 1.4; }
.rf-card .rf-body small { color: #6b7a8a; font-size: 0.78rem; }
.rf-card .rf-clear { display: flex; align-items: center; gap: 10px; margin: 14px 0 0; color: #9aa8b6; line-height: 1.5; }
.rf-card .rf-ok { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(63,194,143,0.14); color: #3fc28f; }
.rf-card .rf-note { margin: 12px 0 0; color: #6b7a8a; font-size: 0.82rem; line-height: 1.5; }
.rf-card .rf-more { margin-top: 12px; }
`;
