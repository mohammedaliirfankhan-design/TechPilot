const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000"
).replace(/\/+$/, "");

const WS_BASE_URL =
  API_BASE_URL.startsWith("https://")
    ? API_BASE_URL.replace(/^https:\/\//, "wss://")
    : API_BASE_URL.replace(/^http:\/\//, "ws://");

/* =========================================================
   TYPES
   ========================================================= */

export type Agent = {
  id: number;
  device_id: string;
  hostname: string;
  display_name?: string | null;
  operating_system: string;
  os_version: string;
  agent_version: string;
  registered_at: string;
};

export type RemoteSession = {
  status: string;
  session_id: number;
  device_id: string;
  session_status: string;
};

export type PendingRemoteSession = {
  pending: boolean;
  session_id?: number;
  device_id?: string;
  status?: string;
};

export type User = {
  id: number;
  email: string;
  is_active: boolean;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

/* =========================================================
   AUTHENTICATION
   ========================================================= */

export async function registerUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    },
  );

  if (!response.ok) {
    let message = "Unable to create account.";

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    },
  );

  if (!response.ok) {
    let message = "Unable to sign in.";

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


export async function getCurrentUser(
  token: string,
): Promise<User> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/auth/me`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message = "Authentication session is invalid.";

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


/* =========================================================
   AGENTS
   ========================================================= */

export async function getAgents(
  token: string,
): Promise<Agent[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/agents/`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message =
      `Failed to fetch agents: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


/* =========================================================
   DEVICE NAME
   Only the name shown in the console changes; the hostname
   and device ID stay as the agent reported them. An empty
   name clears it and the hostname is shown again.
   ========================================================= */

export async function renameDevice(
  deviceId: string,
  displayName: string,
  token: string,
): Promise<Agent> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/agents/${encodeURIComponent(
      deviceId,
    )}/display-name`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        display_name: displayName.trim() || null,
      }),
    },
  );

  if (!response.ok) {
    let message =
      `Failed to rename device: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


/* =========================================================
   REMOVE DEVICE
   Detaches the device from the organization and revokes its
   agent token. History is kept; the PC can be enrolled again.
   ========================================================= */

export async function removeDevice(
  deviceId: string,
  token: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/agents/${encodeURIComponent(deviceId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message =
      `Failed to remove device: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }
}


/* =========================================================
   AGENT INSTALLER DOWNLOAD (signed-in users only)
   ========================================================= */

export async function downloadAgentInstaller(
  token: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/downloads/agent-installer`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message =
      `Download failed: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "TechAIPILOTAgentSetup.exe";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* =========================================================
   DEVICE ENROLLMENT
   ========================================================= */

export type DeviceEnrollmentResponse = {
  status: string;
  enrollment_code: string;
  expires_at: string;
  message: string;
};


export async function createDeviceEnrollment(
  token: string,
): Promise<DeviceEnrollmentResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/device-enrollments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message =
      `Failed to create enrollment code: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}

/* =========================================================
   REMOTE SESSION
   ========================================================= */

export async function createRemoteSession(
  deviceId: string,
  token: string,
): Promise<RemoteSession> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/remote/sessions?device_id=${encodeURIComponent(
      deviceId,
    )}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Failed to create remote session: ${response.status} ${errorText}`,
    );
  }

  return response.json();
}


/* =========================================================
   RECOVER EXISTING REMOTE SESSION
   ========================================================= */

export async function getPendingRemoteSession(
  deviceId: string,
): Promise<PendingRemoteSession> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/remote/sessions/pending/${encodeURIComponent(
      deviceId,
    )}`,
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Failed to check existing remote session: ${response.status} ${errorText}`,
    );
  }

  return response.json();
}


/* =========================================================
   GET REMOTE SESSION
   ========================================================= */

export async function getRemoteSession(
  sessionId: number,
): Promise<RemoteSession> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/remote/sessions/${sessionId}`,
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Failed to fetch remote session: ${response.status} ${errorText}`,
    );
  }

  return response.json();
}


/* =========================================================
   REMOTE SESSION DISCONNECT
   ========================================================= */

export async function disconnectRemoteSession(
  sessionId: number,
  token: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/remote/sessions/${sessionId}/disconnect`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      errorText ||
        "Failed to disconnect remote session.",
    );
  }
}


/* =========================================================
   REMOTE WEBSOCKET BASE URL
   ========================================================= */

export function getRemoteWebSocketBaseUrl(): string {
  return WS_BASE_URL;
}


/* =========================================================
   REMOTE SCREEN WEBSOCKET
   ========================================================= */

export function getRemoteStreamUrl(
  sessionId: number,
  token: string,
): string {
  return (
    `${WS_BASE_URL}/api/v1/remote/sessions/${sessionId}/stream` +
    `?token=${encodeURIComponent(token)}`
  );
}


/* =========================================================
   REMOTE CONTROL WEBSOCKET
   ========================================================= */

export function getRemoteControlUrl(
  sessionId: number,
  token: string,
): string {
  return (
    `${WS_BASE_URL}/api/v1/remote/sessions/${sessionId}/control` +
    `?token=${encodeURIComponent(token)}`
  );
}

/* =========================================================
   REMOTE SHELL
   ========================================================= */

export type ShellType =
  | "POWERSHELL"
  | "CMD";

export type ShellSession = {
  session_id: number;
  device_id: string;
  shell_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
};

export type ShellCommand = {
  command_id: number;
  session_id: number;
  command: string;
  status: string;
  stdout: string | null;
  stderr: string | null;
  exit_code: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export async function createShellSession(
  deviceId: string,
  shellType: ShellType,
  token: string,
): Promise<ShellSession> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/shell/sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        device_id: deviceId,
        shell_type: shellType,
      }),
    },
  );

  if (!response.ok) {
    let message =
      `Failed to create shell session: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


export async function getShellSession(
  sessionId: number,
  token: string,
): Promise<ShellSession> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/shell/sessions/${sessionId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message =
      `Failed to fetch shell session: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


export async function closeShellSession(
  sessionId: number,
  token: string,
): Promise<ShellSession> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/shell/sessions/${sessionId}/close`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message =
      `Failed to close shell session: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}


export async function createShellCommand(
  sessionId: number,
  command: string,
  token: string,
): Promise<ShellCommand> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/shell/sessions/${sessionId}/commands`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        command,
      }),
    },
  );

  if (!response.ok) {
    let message =
      `Failed to submit shell command: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}

export async function getShellCommand(
  commandId: number,
  token: string,
): Promise<ShellCommand> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/shell/commands/${commandId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!response.ok) {
    let message =
      `Failed to fetch shell command: ${response.status}`;

    try {
      const error = await response.json();

      if (typeof error.detail === "string") {
        message = error.detail;
      }
    } catch {
      // Keep default message.
    }

    throw new Error(message);
  }

  return response.json();
}
