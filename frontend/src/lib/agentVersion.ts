// The newest agent version available. Devices below this need the new installer.
// Bump this whenever a new agent installer is released.
export const LATEST_AGENT_VERSION = "1.2.0";

export function isOlderVersion(
  version: string,
  latest: string = LATEST_AGENT_VERSION,
): boolean {
  const a = version.split(".").map((part) => parseInt(part, 10) || 0);
  const b = latest.split(".").map((part) => parseInt(part, 10) || 0);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;

    if (left !== right) {
      return left < right;
    }
  }

  return false;
}

export function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Name shown in the console: the chosen display name, else the hostname.
export function deviceName(agent: {
  hostname: string;
  display_name?: string | null;
}): string {
  return agent.display_name?.trim() || agent.hostname;
}
