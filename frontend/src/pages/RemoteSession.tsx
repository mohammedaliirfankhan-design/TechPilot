import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  KeyboardEvent,
  MouseEvent,
} from "react";

import {
  disconnectRemoteSession,
  getRemoteWebSocketBaseUrl,
} from "../api";

import Logo from "../components/Logo";
import "../session.css";


type MouseButtonName = "left" | "right" | "middle";

type RemoteCommand =
  | { type: "mouse_move"; nx: number; ny: number }
  | {
      type: "mouse_down" | "mouse_up";
      nx: number;
      ny: number;
      button: MouseButtonName;
    }
  | { type: "key_press"; key: string }
  | { type: "hotkey"; keys: string[] }
  | { type: "type_text"; text: string }
  | { type: "scroll"; delta: number; hdelta: number; amount: number }
  | { type: "frame_ack"; seq: number }
  | { type: "viewer_ready" };

type RemoteStatus = "connecting" | "live" | "reconnecting" | "error" | "ended";

type RemoteSessionProps = {
  sessionId?: number;
  token: string;
};


const MOUSE_MOVE_INTERVAL_MS = 16;
const WHEEL_INTERVAL_MS = 16;
const STREAM_RETRY_MS = 1000;
const CONTROL_RETRY_MS = 1000;

// Frame header written by the agent:
//   "TPF1" | uint32 seq | uint16 w | uint16 h                   (12 bytes)
//   "TPF2" | uint32 seq | uint16 w | uint16 h | uint16 rtt_ms   (14 bytes, future agents)
const FRAME_HEADER_BYTES = 12;
const FRAME_HEADER_V2_BYTES = 14;
const SESSION_POLL_MS = 5000;

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/+$/, "");

type ViewerSessionInfo = {
  session_id: number;
  device_id: string;
  hostname: string | null;
  status: string;
};

// Session status for the signed-in viewer (needs backend
// GET /api/v1/remote/sessions/{id}/viewer).
async function fetchViewerSession(
  sessionId: number,
  token: string,
): Promise<ViewerSessionInfo> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/remote/sessions/${sessionId}/viewer`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!response.ok) {
    throw new Error(`Session status unavailable: ${response.status}`);
  }

  return (await response.json()) as ViewerSessionInfo;
}

const BUTTON_NAMES: Record<number, MouseButtonName> = {
  0: "left",
  1: "middle",
  2: "right",
};

const KEY_MAP: Record<string, string> = {
  " ": "space",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  Escape: "esc",
  Backspace: "backspace",
  Delete: "delete",
  Tab: "tab",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Insert: "insert",
  CapsLock: "capslock",
  PrintScreen: "printscreen",
  NumLock: "numlock",
  ScrollLock: "scrolllock",
  Pause: "pause",
  ContextMenu: "apps",
  Meta: "win",
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);


/**
 * Base key for a shortcut, independent of Shift / layout.
 * Ctrl+Shift+1 should be ctrl+shift+1, not ctrl+shift+!.
 */
function shortcutKey(event: KeyboardEvent<HTMLCanvasElement>): string {
  const { code, key } = event;

  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (KEY_MAP[key]) return KEY_MAP[key];

  return key.toLowerCase();
}


export default function RemoteSession({
  sessionId,
  token,
}: RemoteSessionProps) {

  /* ================= SESSION ================= */

  const querySessionId = Number(
    new URLSearchParams(window.location.search).get("remote_session"),
  );

  const effectiveSessionId =
    sessionId && Number.isFinite(sessionId) ? sessionId : querySessionId;


  /* ================= STATE ================= */

  const [remoteStatus, setRemoteStatus] =
    useState<RemoteStatus>("connecting");

  const [remoteError, setRemoteError] =
    useState<string | null>(null);

  const [fps, setFps] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [keysOpen, setKeysOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);


  /* ================= REFS ================= */

  const screenRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const streamSocketRef = useRef<WebSocket | null>(null);
  const controlSocketRef = useRef<WebSocket | null>(null);

  const streamRetryTimerRef = useRef<number | null>(null);
  const controlRetryTimerRef = useRef<number | null>(null);

  const viewerStoppedRef = useRef(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const hasFrameRef = useRef(false);
  const wasLiveRef = useRef(false);
  const framesRenderedRef = useRef(0);
  const noticeTimerRef = useRef<number | null>(null);

  // Latest-frame-wins: only one frame is ever waiting to be drawn.
  const pendingFrameRef = useRef<{ blob: Blob; seq: number } | null>(null);
  const renderingFrameRef = useRef(false);
  const renderAnimationRef = useRef<number | null>(null);

  const latestMousePositionRef = useRef<{ nx: number; ny: number } | null>(null);
  const mouseMoveTimerRef = useRef<number | null>(null);
  const pressedButtonsRef = useRef<Set<MouseButtonName>>(new Set());

  const wheelDeltaRef = useRef(0);
  const wheelHDeltaRef = useRef(0);
  const wheelTimerRef = useRef<number | null>(null);


  /* ================= WEBSOCKET URL ================= */

  const buildWebSocketUrl = useCallback(
    (path: string) => {
      const baseUrl =
        `${getRemoteWebSocketBaseUrl()}` +
        `/api/v1/remote/sessions/${effectiveSessionId}${path}`;

      const separator = path.includes("?") ? "&" : "?";

      return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    },
    [effectiveSessionId, token],
  );


  /* ================= SEND CONTROL COMMAND ================= */

  const sendRemoteCommand = useCallback((command: RemoteCommand) => {
    const socket = controlSocketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      socket.send(JSON.stringify(command));
      return true;
    } catch (error) {
      console.error("[CONTROL] Failed to send command:", error);
      return false;
    }
  }, []);


  /* ================= CANVAS SIZING =================
   * Scale the remote frame to fill the available area while
   * keeping its aspect ratio (works for any streamed resolution).
   */

  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = screenRef.current;

    if (!canvas || !container || canvas.width <= 0 || canvas.height <= 0) {
      return;
    }

    const availableWidth = container.clientWidth;
    const availableHeight = container.clientHeight;

    if (availableWidth <= 0 || availableHeight <= 0) {
      return;
    }

    const scale = Math.min(
      availableWidth / canvas.width,
      availableHeight / canvas.height,
    );

    canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
    canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
  }, []);

  useEffect(() => {
    const container = screenRef.current;

    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => fitCanvas());
    observer.observe(container);

    return () => observer.disconnect();
  }, [fitCanvas]);


  /* ================= REMOTE COORDINATES =================
   * Normalised 0..1 coordinates; the agent maps them to the real
   * monitor, so downscaled frames and DPI scaling do not matter.
   */

  const getRemoteCoordinates = useCallback(
    (event: MouseEvent<HTMLCanvasElement> | globalThis.MouseEvent) => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();

      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }

      const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));

      return { nx, ny };
    },
    [],
  );


  /* ================= RENDER LATEST FRAME ================= */

  const renderLatestFrame = useCallback(async () => {
    if (renderingFrameRef.current || viewerStoppedRef.current) {
      return;
    }

    const canvas = canvasRef.current;
    const pending = pendingFrameRef.current;

    if (!canvas || !pending) {
      return;
    }

    pendingFrameRef.current = null;
    renderingFrameRef.current = true;

    try {
      const bitmap = await createImageBitmap(pending.blob);

      if (viewerStoppedRef.current) {
        bitmap.close();
        return;
      }

      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        fitCanvas();
      }

      const context = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });

      if (context) {
        context.drawImage(bitmap, 0, 0);
      }

      bitmap.close();

      framesRenderedRef.current += 1;

      // "Live" means a picture is actually on screen, not just a socket.
      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        wasLiveRef.current = true;
        setRemoteStatus("live");
        setRemoteError(null);
      }

      // Tell the agent this frame is on screen; it uses this to pace
      // itself so frames never queue up in the network.
      if (pending.seq > 0) {
        sendRemoteCommand({ type: "frame_ack", seq: pending.seq });
      }

    } catch (error) {
      console.error("[REMOTE] Frame rendering error:", error);

    } finally {
      renderingFrameRef.current = false;
    }

    if (pendingFrameRef.current && !viewerStoppedRef.current) {
      renderAnimationRef.current = window.requestAnimationFrame(() => {
        renderAnimationRef.current = null;
        void renderLatestFrame();
      });
    }
  }, [fitCanvas, sendRemoteCommand]);


  const scheduleFrameRender = useCallback(() => {
    if (
      viewerStoppedRef.current ||
      renderingFrameRef.current ||
      renderAnimationRef.current !== null
    ) {
      return;
    }

    renderAnimationRef.current = window.requestAnimationFrame(() => {
      renderAnimationRef.current = null;
      void renderLatestFrame();
    });
  }, [renderLatestFrame]);


  /* ================= CONNECT STREAM ================= */

  useEffect(() => {
    if (!Number.isFinite(effectiveSessionId) || effectiveSessionId <= 0) {
      setRemoteStatus("error");
      setRemoteError("Invalid remote session ID.");
      return;
    }

    viewerStoppedRef.current = false;

    let disposed = false;

    const streamUrl = buildWebSocketUrl("/stream");

    const connectStream = () => {
      if (disposed || viewerStoppedRef.current) {
        return;
      }

      const current = streamSocketRef.current;

      if (
        current &&
        (current.readyState === WebSocket.OPEN ||
          current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      let socket: WebSocket;

      try {
        socket = new WebSocket(streamUrl);
        socket.binaryType = "arraybuffer";
      } catch (error) {
        console.error("[REMOTE] Failed to create stream socket:", error);

        if (!disposed) {
          setRemoteStatus("error");
          setRemoteError("Failed to create remote screen connection.");
          streamRetryTimerRef.current = window.setTimeout(
            connectStream,
            STREAM_RETRY_MS,
          );
        }
        return;
      }

      streamSocketRef.current = socket;

      socket.onopen = () => {
        if (disposed) {
          return;
        }

        setRemoteError(null);

        // Ask the agent for a fresh full frame right away.
        sendRemoteCommand({ type: "viewer_ready" });
      };

      socket.onmessage = (event) => {
        if (disposed || viewerStoppedRef.current) {
          return;
        }

        let blob: Blob | null = null;
        let seq = 0;

        if (event.data instanceof ArrayBuffer) {
          const data = event.data;
          const view = new DataView(data);

          const hasMagic =
            data.byteLength > FRAME_HEADER_V2_BYTES &&
            view.getUint8(0) === 0x54 && // T
            view.getUint8(1) === 0x50 && // P
            view.getUint8(2) === 0x46;   // F

          const version = hasMagic ? view.getUint8(3) : 0;

          if (version === 0x31 || version === 0x32) {
            const headerBytes =
              version === 0x32 ? FRAME_HEADER_V2_BYTES : FRAME_HEADER_BYTES;

            seq = view.getUint32(4);

            if (version === 0x32) {
              const rtt = view.getUint16(12);
              setLatencyMs(rtt > 0 ? rtt : null);
            }

            blob = new Blob(
              [new Uint8Array(data, headerBytes)],
              { type: "image/jpeg" },
            );
          } else {
            blob = new Blob([data], { type: "image/jpeg" });
          }
        } else if (event.data instanceof Blob) {
          blob = event.data;
        }

        if (!blob) {
          return;
        }

        // Latest frame wins. If an older frame was still waiting, it
        // is dropped; acking the newer seq covers it too.
        pendingFrameRef.current = { blob, seq };
        scheduleFrameRender();
      };

      socket.onerror = (event) => {
        if (!disposed) {
          console.error("[REMOTE] Screen stream error:", event);
        }
      };

      socket.onclose = (event) => {
        if (streamSocketRef.current === socket) {
          streamSocketRef.current = null;
        }

        if (disposed || viewerStoppedRef.current) {
          return;
        }

        console.log("[REMOTE] Screen stream closed:", event.code, event.reason);

        hasFrameRef.current = false;
        setRemoteStatus(wasLiveRef.current ? "reconnecting" : "connecting");
        setRemoteError(null);

        streamRetryTimerRef.current = window.setTimeout(
          connectStream,
          STREAM_RETRY_MS,
        );
      };
    };

    connectStream();

    return () => {
      disposed = true;
      viewerStoppedRef.current = true;

      if (streamRetryTimerRef.current !== null) {
        window.clearTimeout(streamRetryTimerRef.current);
        streamRetryTimerRef.current = null;
      }

      if (renderAnimationRef.current !== null) {
        window.cancelAnimationFrame(renderAnimationRef.current);
        renderAnimationRef.current = null;
      }

      pendingFrameRef.current = null;

      const socket = streamSocketRef.current;
      streamSocketRef.current = null;

      if (socket) {
        try {
          socket.close(1000, "viewer cleanup");
        } catch {
          // ignore
        }
      }
    };
  }, [
    effectiveSessionId,
    buildWebSocketUrl,
    scheduleFrameRender,
    sendRemoteCommand,
  ]);


  /* ================= CONNECT CONTROL ================= */

  useEffect(() => {
    if (!Number.isFinite(effectiveSessionId) || effectiveSessionId <= 0) {
      return;
    }

    let disposed = false;

    const controlUrl = buildWebSocketUrl("/control");

    const connectControl = () => {
      if (disposed || viewerStoppedRef.current) {
        return;
      }

      const current = controlSocketRef.current;

      if (
        current &&
        (current.readyState === WebSocket.OPEN ||
          current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      let socket: WebSocket;

      try {
        socket = new WebSocket(controlUrl);
      } catch (error) {
        console.error("[CONTROL] Failed to create control socket:", error);
        controlRetryTimerRef.current = window.setTimeout(
          connectControl,
          CONTROL_RETRY_MS,
        );
        return;
      }

      controlSocketRef.current = socket;

      socket.onopen = () => {
        // Resets the agent's in-flight counter and requests a full frame.
        sendRemoteCommand({ type: "viewer_ready" });
      };

      socket.onerror = (event) => {
        console.error("[CONTROL] Control socket error:", event);
      };

      socket.onclose = (event) => {
        if (controlSocketRef.current === socket) {
          controlSocketRef.current = null;
        }

        if (disposed || viewerStoppedRef.current) {
          return;
        }

        console.log("[CONTROL] Control socket closed:", event.code, event.reason);

        controlRetryTimerRef.current = window.setTimeout(
          connectControl,
          CONTROL_RETRY_MS,
        );
      };
    };

    connectControl();

    return () => {
      disposed = true;

      if (controlRetryTimerRef.current !== null) {
        window.clearTimeout(controlRetryTimerRef.current);
        controlRetryTimerRef.current = null;
      }

      const socket = controlSocketRef.current;
      controlSocketRef.current = null;

      if (socket) {
        try {
          socket.close(1000, "viewer cleanup");
        } catch {
          // ignore
        }
      }
    };
  }, [effectiveSessionId, buildWebSocketUrl, sendRemoteCommand]);


  /* ================= MOUSE MOVE ================= */

  const flushMouseMove = useCallback(() => {
    if (mouseMoveTimerRef.current !== null) {
      window.clearTimeout(mouseMoveTimerRef.current);
      mouseMoveTimerRef.current = null;
    }

    const position = latestMousePositionRef.current;

    if (position) {
      sendRemoteCommand({ type: "mouse_move", ...position });
    }
  }, [sendRemoteCommand]);

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      const coordinates = getRemoteCoordinates(event);

      if (!coordinates) {
        return;
      }

      latestMousePositionRef.current = coordinates;

      if (mouseMoveTimerRef.current !== null) {
        return;
      }

      mouseMoveTimerRef.current = window.setTimeout(() => {
        mouseMoveTimerRef.current = null;

        const position = latestMousePositionRef.current;

        if (position) {
          sendRemoteCommand({ type: "mouse_move", ...position });
        }
      }, MOUSE_MOVE_INTERVAL_MS);
    },
    [getRemoteCoordinates, sendRemoteCommand],
  );


  /* ================= MOUSE BUTTONS =================
   * Real down/up events instead of synthetic clicks: dragging,
   * text selection and window moving work, and Windows itself
   * recognises double-clicks (previously a double-click sent
   * four clicks).
   */

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      canvasRef.current?.focus();

      const button = BUTTON_NAMES[event.button];
      const coordinates = getRemoteCoordinates(event);

      if (!button || !coordinates) {
        return;
      }

      latestMousePositionRef.current = coordinates;
      flushMouseMove();

      pressedButtonsRef.current.add(button);

      sendRemoteCommand({ type: "mouse_down", button, ...coordinates });
    },
    [flushMouseMove, getRemoteCoordinates, sendRemoteCommand],
  );

  // Listen on window so releasing the button outside the canvas
  // never leaves it stuck "down" on the remote PC.
  useEffect(() => {
    const onMouseUp = (event: globalThis.MouseEvent) => {
      const button = BUTTON_NAMES[event.button];

      if (!button || !pressedButtonsRef.current.has(button)) {
        return;
      }

      pressedButtonsRef.current.delete(button);

      const coordinates =
        getRemoteCoordinates(event) ?? latestMousePositionRef.current;

      if (!coordinates) {
        return;
      }

      sendRemoteCommand({ type: "mouse_up", button, ...coordinates });
    };

    window.addEventListener("mouseup", onMouseUp);

    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [getRemoteCoordinates, sendRemoteCommand]);

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      event.preventDefault();
    },
    [],
  );


  /* ================= SCROLL =================
   * Browser deltas are converted to Windows wheel units
   * (120 = one notch) and coalesced every ~16 ms. Previously one
   * wheel notch could scroll ~100 notches on the remote PC.
   */

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const toWheelUnits = (value: number, mode: number) => {
      if (mode === 1) return value * 40;   // lines
      if (mode === 2) return value * 800;  // pages
      return value * 1.2;                  // pixels (100px ≈ 1 notch)
    };

    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();

      wheelDeltaRef.current -= toWheelUnits(event.deltaY, event.deltaMode);
      wheelHDeltaRef.current += toWheelUnits(event.deltaX, event.deltaMode);

      if (wheelTimerRef.current !== null) {
        return;
      }

      wheelTimerRef.current = window.setTimeout(() => {
        wheelTimerRef.current = null;

        const delta = Math.round(wheelDeltaRef.current);
        const hdelta = Math.round(wheelHDeltaRef.current);

        wheelDeltaRef.current = 0;
        wheelHDeltaRef.current = 0;

        if (delta === 0 && hdelta === 0) {
          return;
        }

        sendRemoteCommand({
          type: "scroll",
          delta: Math.max(-2400, Math.min(2400, delta)),
          hdelta: Math.max(-2400, Math.min(2400, hdelta)),
          amount: Math.sign(delta),
        });
      }, WHEEL_INTERVAL_MS);
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => canvas.removeEventListener("wheel", onWheel);
  }, [sendRemoteCommand]);


  /* ================= KEYBOARD ================= */

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLCanvasElement>) => {
      // Keep the browser from acting on keys meant for the remote PC
      // (Tab, arrows, Ctrl+F, Ctrl+S, ...). The browser still keeps
      // Ctrl+W / Ctrl+T / Alt+Tab; those cannot be intercepted.
      event.preventDefault();

      if (MODIFIER_KEYS.has(event.key)) {
        return;
      }

      const hasCommandModifier = event.ctrlKey || event.altKey || event.metaKey;

      // Printable characters: send the character itself. This handles
      // Shift, Caps Lock and the user's keyboard layout correctly, and
      // key repeat (holding a key) works.
      if (!hasCommandModifier && event.key.length === 1) {
        sendRemoteCommand({ type: "type_text", text: event.key });
        return;
      }

      const key = shortcutKey(event);

      const modifiers: string[] = [];
      if (event.ctrlKey) modifiers.push("ctrl");
      if (event.altKey) modifiers.push("alt");
      if (event.shiftKey) modifiers.push("shift");
      if (event.metaKey) modifiers.push("win");

      if (modifiers.length > 0) {
        sendRemoteCommand({ type: "hotkey", keys: [...modifiers, key] });
        return;
      }

      sendRemoteCommand({ type: "key_press", key });
    },
    [sendRemoteCommand],
  );


  /* ================= SESSION INFO / HEALTH ================= */

  // Frames drawn per second, sampled once a second.
  useEffect(() => {
    const interval = window.setInterval(() => {
      setFps(framesRenderedRef.current);
      framesRenderedRef.current = 0;
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  // Show which device this session belongs to.
  useEffect(() => {
    if (!Number.isFinite(effectiveSessionId) || effectiveSessionId <= 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const session = await fetchViewerSession(effectiveSessionId, token);

        if (!cancelled) {
          setDeviceName(session.hostname ?? session.device_id ?? null);
        }
      } catch {
        // The name is cosmetic; the session works without it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [effectiveSessionId, token]);

  // Notice when the session is ended elsewhere (other tab, agent, admin).
  useEffect(() => {
    if (!Number.isFinite(effectiveSessionId) || effectiveSessionId <= 0) {
      return;
    }

    const interval = window.setInterval(async () => {
      if (viewerStoppedRef.current) {
        return;
      }

      try {
        const session = await fetchViewerSession(effectiveSessionId, token);

        if (session.status === "ENDED") {
          viewerStoppedRef.current = true;
          setRemoteStatus("ended");
          streamSocketRef.current?.close(1000, "session ended");
          controlSocketRef.current?.close(1000, "session ended");
        }
      } catch {
        // Temporary API failures should not end the viewer.
      }
    }, SESSION_POLL_MS);

    return () => window.clearInterval(interval);
  }, [effectiveSessionId, token]);

  // Track fullscreen; while fullscreen, ask the browser to pass system
  // keys (Windows key, Alt+Tab, Esc) to the page where supported.
  useEffect(() => {
    const onChange = () => {
      const active = document.fullscreenElement === rootRef.current;
      setIsFullscreen(active);

      const keyboard = (navigator as Navigator & {
        keyboard?: { lock?: () => Promise<void>; unlock?: () => void };
      }).keyboard;

      if (active) {
        void keyboard?.lock?.().catch(() => undefined);
      } else {
        keyboard?.unlock?.();
      }

      window.setTimeout(fitCanvas, 50);
    };

    document.addEventListener("fullscreenchange", onChange);

    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [fitCanvas]);

  /* ================= TOOLBAR ACTIONS ================= */

  const showNotice = (message: string) => {
    setNotice(message);

    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }

    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3000);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await rootRef.current?.requestFullscreen();
      }
    } catch {
      showNotice("Fullscreen isn't available in this browser.");
    }

    canvasRef.current?.focus();
  };

  const sendShortcut = (keys: string[], label: string) => {
    setKeysOpen(false);

    const sent =
      keys.length === 1
        ? sendRemoteCommand({ type: "key_press", key: keys[0] })
        : sendRemoteCommand({ type: "hotkey", keys });

    showNotice(sent ? `Sent ${label}` : "Not connected. Try again in a moment.");
    canvasRef.current?.focus();
  };

  const pasteAsTyping = async () => {
    setKeysOpen(false);

    try {
      const text = await navigator.clipboard.readText();

      if (!text) {
        showNotice("Your clipboard is empty.");
        return;
      }

      if (text.length > 2000) {
        showNotice("Clipboard text is too long (2,000 characters max).");
        return;
      }

      const sent = sendRemoteCommand({ type: "type_text", text });
      showNotice(sent ? `Typed ${text.length} characters` : "Not connected. Try again in a moment.");
    } catch {
      showNotice("Allow clipboard access in your browser to paste.");
    }

    canvasRef.current?.focus();
  };

  // Close the shortcuts menu with Escape or a click elsewhere.
  useEffect(() => {
    if (!keysOpen) {
      return;
    }

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setKeysOpen(false);
      }
    };

    const onClick = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;

      if (!target?.closest(".tps-keys")) {
        setKeysOpen(false);
      }
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [keysOpen]);


  /* ================= END SESSION ================= */

  const endSession = async () => {
    if (!Number.isFinite(effectiveSessionId) || effectiveSessionId <= 0) {
      window.close();
      return;
    }

    // Release any button still held on the remote side.
    pressedButtonsRef.current.forEach((button) => {
      const position = latestMousePositionRef.current ?? { nx: 0.5, ny: 0.5 };
      sendRemoteCommand({ type: "mouse_up", button, ...position });
    });
    pressedButtonsRef.current.clear();

    viewerStoppedRef.current = true;
    setRemoteStatus("ended");

    if (mouseMoveTimerRef.current !== null) {
      window.clearTimeout(mouseMoveTimerRef.current);
      mouseMoveTimerRef.current = null;
    }

    if (wheelTimerRef.current !== null) {
      window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = null;
    }

    try {
      await disconnectRemoteSession(effectiveSessionId, token);
    } catch (error) {
      console.error("[REMOTE] Failed to end session:", error);
    }

    const streamSocket = streamSocketRef.current;
    streamSocketRef.current = null;

    if (streamSocket) {
      try {
        streamSocket.close(1000, "session ended");
      } catch {
        // ignore
      }
    }

    const controlSocket = controlSocketRef.current;
    controlSocketRef.current = null;

    if (controlSocket) {
      try {
        controlSocket.close(1000, "session ended");
      } catch {
        // ignore
      }
    }

    pendingFrameRef.current = null;

    // Browser security may block window.close() if this tab was not
    // opened by script; the session is already closed on the backend.
    window.close();
  };


  /* ================= RENDER ================= */

  const statusLabel: Record<RemoteStatus, string> = {
    connecting: "Connecting",
    live: "Live",
    reconnecting: "Reconnecting",
    error: "Error",
    ended: "Ended",
  };

  const overlayText: Partial<Record<RemoteStatus, { title: string; body: string }>> = {
    connecting: {
      title: "Connecting to the remote screen…",
      body: "Waiting for the agent to send the first frame.",
    },
    reconnecting: {
      title: "Connection lost. Reconnecting…",
      body: "The picture will come back on its own once the connection recovers.",
    },
    error: {
      title: "The remote screen is unavailable.",
      body: remoteError ?? "Check that the agent is running on the device.",
    },
    ended: {
      title: "This session has ended.",
      body: "You can close this tab.",
    },
  };

  const overlay = overlayText[remoteStatus];

  return (
    <div ref={rootRef} className="tps">
      <header className="tps-bar">
        <div className="tps-title">
          <Logo size={26} />
          <strong>{deviceName ?? "Remote session"}</strong>
          <span className="tps-muted">Session {effectiveSessionId}</span>
          <span className={`tps-status tps-status-${remoteStatus}`} role="status">
            <span className="tps-status-dot" aria-hidden="true" />
            {statusLabel[remoteStatus]}
            {remoteStatus === "live" && (
              <>
                {latencyMs !== null && <> · {latencyMs} ms</>}
                {" · "}
                {fps} fps
              </>
            )}
          </span>
        </div>

        <div className="tps-tools">
          <div className="tps-keys">
            <button
              type="button"
              className="tps-btn"
              aria-haspopup="menu"
              aria-expanded={keysOpen}
              onClick={() => setKeysOpen((open) => !open)}
              disabled={remoteStatus === "ended"}
            >
              Keys
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {keysOpen && (
              <div className="tps-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => sendShortcut(["win"], "Windows key")}>
                  Windows key
                </button>
                <button type="button" role="menuitem" onClick={() => sendShortcut(["alt", "tab"], "Alt+Tab")}>
                  Alt+Tab
                </button>
                <button type="button" role="menuitem" onClick={() => sendShortcut(["ctrl", "shift", "esc"], "Task Manager")}>
                  Task Manager <span>Ctrl+Shift+Esc</span>
                </button>
                <button type="button" role="menuitem" onClick={() => sendShortcut(["win", "r"], "Run dialog")}>
                  Run dialog <span>Win+R</span>
                </button>
                <button type="button" role="menuitem" onClick={() => sendShortcut(["win", "l"], "Lock")}>
                  Lock screen <span>Win+L</span>
                </button>
                <div className="tps-menu-sep" role="separator" />
                <button type="button" role="menuitem" onClick={() => void pasteAsTyping()}>
                  Paste as typing
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className="tps-btn"
            onClick={() => void toggleFullscreen()}
            aria-pressed={isFullscreen}
          >
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>

          <button
            type="button"
            className="tps-btn tps-btn-danger"
            onClick={endSession}
            disabled={remoteStatus === "ended"}
          >
            End session
          </button>
        </div>
      </header>

      <main className="tps-stage">
        <div ref={screenRef} className="tps-screen">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="Remote screen. Click to control the remote device."
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onContextMenu={handleContextMenu}
            onKeyDown={handleKeyDown}
            className={remoteStatus === "live" ? "" : "tps-canvas-empty"}
          />
        </div>

        {overlay && (
          <div className="tps-overlay">
            <strong>{overlay.title}</strong>
            <span>{overlay.body}</span>
          </div>
        )}

        <p className="tps-notice" aria-live="polite">
          {notice}
        </p>
      </main>

      <footer className="tps-foot">
        Click the screen to control it. Mouse, keyboard and scroll go to the
        remote device.
        {isFullscreen && " Hold Esc to leave fullscreen."}
      </footer>
    </div>
  );
}
