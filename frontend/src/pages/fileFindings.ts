// file-findings-ui-version: 1
import type { Severity, Verdict } from "./networkInsights";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/+$/, "");

/* =========================================================
   TYPES (match GET /api/v1/security/files/findings)
   ========================================================= */

export type FileFinding = {
  id: number;
  device_id: string;
  hostname?: string | null;
  display_name?: string | null;
  rule: string;
  severity: string;
  title: string;
  detail: string | null;
  subject: string | null;
  occurred_at: string;
  occurrences: number;
  emailed: boolean;
};

export type FileFindingsReport = {
  hours: number;
  total: number;
  // true: this device reports downloads and USB activity, so "no findings"
  // really means all clear. false/null: unknown, so nothing is claimed.
  device_reports_files: boolean | null;
  findings: FileFinding[];
};

type ProblemLike = {
  severity: Severity;
  title: string;
  detail: string;
};

// The parts of the existing device assessment this code reads.
type AssessmentLike = {
  verdict: Verdict;
  headline: string;
  problems: readonly ProblemLike[];
  goodNews: readonly string[];
};

export type MergedAssessment = {
  verdict: Verdict;
  headline: string;
  problems: ProblemLike[];
  goodNews: string[];
};

/* =========================================================
   LOADING
   ========================================================= */

/**
 * The last day's findings for one device. Returns null on any problem
 * (older backend, no access, network error) so the rest of the page is
 * never affected.
 */
export async function fetchDeviceFindings(
  token: string,
  deviceId: string,
  hours = 24,
): Promise<FileFindingsReport | null> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/security/files/findings` +
        `?device_id=${encodeURIComponent(deviceId)}&hours=${hours}&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as FileFindingsReport;
  } catch {
    return null;
  }
}

/* =========================================================
   MERGING INTO THE "THIS DEVICE NEEDS A LOOK" CARD
   ========================================================= */

function namesOf(findings: FileFinding[]): string {
  const names = [
    ...new Set(
      findings
        .map((f) => f.subject)
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  if (names.length === 0) {
    return "Open Files & downloads to see them.";
  }

  const shown = names.slice(0, 3).join(", ");
  const more = names.length - 3;

  return more > 0 ? `${shown} and ${more} more.` : `${shown}.`;
}

/**
 * Adds download and USB findings to the device's plain-words summary.
 *
 * - Findings become entries under "needs a look".
 * - When the device reports file activity and has none, two reassurance
 *   chips are added ("No risky downloads", "No risky USB copies").
 * - If the device does not report file activity (older agent) or the
 *   findings could not be loaded, nothing is added and nothing is claimed.
 */
export function mergeFileFindings(
  base: AssessmentLike,
  report: FileFindingsReport | null,
): MergedAssessment {
  const unchanged: MergedAssessment = {
    verdict: base.verdict,
    headline: base.headline,
    problems: [...base.problems],
    goodNews: [...base.goodNews],
  };

  if (!report || report.device_reports_files !== true || base.verdict === "unknown") {
    return unchanged;
  }

  const downloads = report.findings.filter((f) => f.rule === "risky_download");
  const programs = report.findings.filter((f) => f.rule === "usb_program_copied");
  const bulk = report.findings.filter((f) => f.rule === "usb_bulk_copy");

  const added: ProblemLike[] = [];

  if (downloads.length > 0) {
    added.push({
      severity: "warn",
      title:
        downloads.length === 1
          ? "1 download needs a look"
          : `${downloads.length} downloads need a look`,
      detail: namesOf(downloads),
    });
  }

  if (programs.length > 0) {
    added.push({
      severity: "warn",
      title:
        programs.length === 1
          ? "A program or script was copied to a USB drive"
          : `${programs.length} programs or scripts were copied to USB drives`,
      detail: namesOf(programs),
    });
  }

  if (bulk.length === 1) {
    added.push({
      severity: "warn",
      title: bulk[0].title,
      detail: bulk[0].detail ?? "Check that this was intended.",
    });
  } else if (bulk.length > 1) {
    added.push({
      severity: "warn",
      title: `${bulk.length} large copies to USB drives`,
      detail: bulk.map((f) => f.title).join("; ") + ".",
    });
  }

  const goodNews = [...base.goodNews];

  if (downloads.length === 0) {
    goodNews.push("No risky downloads");
  }

  if (programs.length === 0 && bulk.length === 0) {
    goodNews.push("No risky USB copies");
  }

  const needsLook = added.length > 0 && base.verdict === "safe";

  return {
    verdict: needsLook ? "attention" : base.verdict,
    headline: needsLook ? "This device needs a look" : base.headline,
    problems: [...base.problems, ...added],
    goodNews,
  };
}
