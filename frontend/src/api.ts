const API_BASE_URL = "http://localhost:8000";


/* =========================================================
   TYPES
   ========================================================= */

export type Agent = {
  id: number;
  device_id: string;
  hostname: string;
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


/* =========================================================
   AGENTS
   ========================================================= */

export async function getAgents(): Promise<Agent[]> {

  const response = await fetch(
    `${API_BASE_URL}/api/v1/agents/`,
  );

  if (!response.ok) {

    throw new Error(
      `Failed to fetch agents: ${response.status}`,
    );
  }

  return response.json();
}


/* =========================================================
   REMOTE SESSION
   ========================================================= */

export async function createRemoteSession(
  deviceId: string,
): Promise<RemoteSession> {

  const response = await fetch(
    `${API_BASE_URL}/api/v1/remote/sessions?device_id=${encodeURIComponent(
      deviceId,
    )}`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {

    const errorText =
      await response.text();

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

    const errorText =
      await response.text();

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

    const errorText =
      await response.text();

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
): Promise<void> {

  const response = await fetch(
    `${API_BASE_URL}/api/v1/remote/sessions/${sessionId}/disconnect`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {

    const errorText =
      await response.text();

    throw new Error(
      `Failed to disconnect remote session: ${response.status} ${errorText}`,
    );
  }
}


/* =========================================================
   REMOTE SCREEN WEBSOCKET
   ========================================================= */

export function getRemoteStreamUrl(
  sessionId: number,
): string {

  return `ws://localhost:8000/api/v1/remote/sessions/${sessionId}/stream`;
}


/* =========================================================
   REMOTE CONTROL WEBSOCKET
   ========================================================= */

export function getRemoteControlUrl(
  sessionId: number,
): string {

  return `ws://localhost:8000/api/v1/remote/sessions/${sessionId}/control`;
}