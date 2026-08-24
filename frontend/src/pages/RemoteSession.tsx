import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  KeyboardEvent,
  MouseEvent,
  WheelEvent,
} from "react";

import {
  disconnectRemoteSession,
} from "../api";


type RemoteCommand =
  | {
      type: "mouse_move";
      x: number;
      y: number;
    }
  | {
      type: "mouse_click";
      x: number;
      y: number;
      button: "left" | "right";
      clicks: number;
    }
  | {
      type: "key_press";
      key: string;
    }
  | {
      type: "hotkey";
      keys: string[];
    }
  | {
      type: "scroll";
      amount: number;
    };


type RemoteStatus =
  | "connecting"
  | "live"
  | "error"
  | "ended";


type RemoteSessionProps = {
  sessionId?: number;
};


const MOUSE_MOVE_INTERVAL_MS = 33;
const WHEEL_INTERVAL_MS = 25;
const STREAM_RETRY_MS = 1000;
const CONTROL_RETRY_MS = 1000;


export default function RemoteSession({
  sessionId,
}: RemoteSessionProps) {

  /*
   * =========================================================
   * SESSION
   * =========================================================
   */

  const querySessionId = Number(
    new URLSearchParams(
      window.location.search,
    ).get("remote_session"),
  );

  const effectiveSessionId =
    sessionId &&
    Number.isFinite(sessionId)
      ? sessionId
      : querySessionId;


  /*
   * =========================================================
   * STATE
   * =========================================================
   */

  const [
    remoteStatus,
    setRemoteStatus,
  ] = useState<RemoteStatus>("connecting");

  const [
    remoteError,
    setRemoteError,
  ] = useState<string | null>(null);


  /*
   * =========================================================
   * REFS
   * =========================================================
   */

  const screenRef =
    useRef<HTMLDivElement | null>(null);

  const canvasRef =
    useRef<HTMLCanvasElement | null>(null);

  const streamSocketRef =
    useRef<WebSocket | null>(null);

  const controlSocketRef =
    useRef<WebSocket | null>(null);

  const streamRetryTimerRef =
    useRef<number | null>(null);

  const controlRetryTimerRef =
    useRef<number | null>(null);

  const viewerStoppedRef =
    useRef(false);


  /*
   * Latest-frame-wins rendering.
   *
   * We intentionally keep only ONE pending frame.
   * If 5 frames arrive while the browser is decoding
   * one frame, the four old frames are discarded.
   */

  const pendingFrameRef =
    useRef<Blob | null>(null);

  const renderingFrameRef =
    useRef(false);

  const renderAnimationRef =
    useRef<number | null>(null);

  const remoteWidthRef =
    useRef(0);

  const remoteHeightRef =
    useRef(0);


  /*
   * Mouse coalescing.
   *
   * The browser can generate hundreds of mousemove events
   * per second. We send only the newest position roughly
   * every 33 ms (~30 commands/sec).
   */

  const latestMousePositionRef =
    useRef<{
      x: number;
      y: number;
    } | null>(null);

  const mouseMoveTimerRef =
    useRef<number | null>(null);


  /*
   * Wheel coalescing.
   */

  const wheelAmountRef =
    useRef(0);

  const wheelTimerRef =
    useRef<number | null>(null);


  /*
   * =========================================================
   * BUILD WEBSOCKET URL
   * =========================================================
   */

  const buildWebSocketUrl =
    useCallback(
      (path: string) => {

        const hostname =
          window.location.hostname;

        const protocol =
          window.location.protocol === "https:"
            ? "wss:"
            : "ws:";

        return (
          `${protocol}//${hostname}:8000` +
          `/api/v1/remote/sessions/` +
          `${effectiveSessionId}` +
          path
        );
      },
      [effectiveSessionId],
    );


  /*
   * =========================================================
   * SEND CONTROL COMMAND
   * =========================================================
   */

  const sendRemoteCommand =
    useCallback(
      (command: RemoteCommand) => {

        const socket =
          controlSocketRef.current;

        if (
          !socket ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return false;
        }

        try {

          socket.send(
            JSON.stringify(command),
          );

          return true;

        } catch (error) {

          console.error(
            "[CONTROL] Failed to send command:",
            error,
          );

          return false;
        }
      },
      [],
    );


  /*
   * =========================================================
   * REMOTE COORDINATES
   * =========================================================
   */

  const getRemoteCoordinates =
    useCallback(
      (
        event:
          | MouseEvent<HTMLCanvasElement>
          | globalThis.MouseEvent,
      ) => {

        const canvas =
          canvasRef.current;

        if (!canvas) {
          return null;
        }

        const rect =
          canvas.getBoundingClientRect();

        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          canvas.width <= 0 ||
          canvas.height <= 0
        ) {
          return null;
        }

        const scaleX =
          canvas.width / rect.width;

        const scaleY =
          canvas.height / rect.height;

        const x = Math.max(
          0,
          Math.min(
            canvas.width - 1,
            Math.round(
              (event.clientX - rect.left) *
              scaleX,
            ),
          ),
        );

        const y = Math.max(
          0,
          Math.min(
            canvas.height - 1,
            Math.round(
              (event.clientY - rect.top) *
              scaleY,
            ),
          ),
        );

        return {
          x,
          y,
        };
      },
      [],
    );


  /*
   * =========================================================
   * RENDER LATEST FRAME
   * =========================================================
   */

  const renderLatestFrame =
    useCallback(
      async () => {

        if (
          renderingFrameRef.current ||
          viewerStoppedRef.current
        ) {
          return;
        }

        const canvas =
          canvasRef.current;

        if (!canvas) {
          return;
        }

        const frame =
          pendingFrameRef.current;

        if (!frame) {
          return;
        }

        pendingFrameRef.current =
          null;

        renderingFrameRef.current =
          true;

        try {

          const bitmap =
            await createImageBitmap(frame);

          if (viewerStoppedRef.current) {
            bitmap.close();
            return;
          }

          if (
            canvas.width !== bitmap.width ||
            canvas.height !== bitmap.height
          ) {

            canvas.width =
              bitmap.width;

            canvas.height =
              bitmap.height;

            remoteWidthRef.current =
              bitmap.width;

            remoteHeightRef.current =
              bitmap.height;

            console.log(
              "[REMOTE] Remote resolution:",
              bitmap.width,
              "x",
              bitmap.height,
            );
          }

          const context =
            canvas.getContext("2d", {
              alpha: false,
              desynchronized: true,
            });

          if (!context) {
            bitmap.close();
            return;
          }

          context.drawImage(
            bitmap,
            0,
            0,
            canvas.width,
            canvas.height,
          );

          bitmap.close();

        } catch (error) {

          console.error(
            "[REMOTE] Frame rendering error:",
            error,
          );

        } finally {

          renderingFrameRef.current =
            false;
        }

        /*
         * If a newer frame arrived while the current
         * frame was being decoded/drawn, immediately
         * schedule the newest one.
         */

        if (
          pendingFrameRef.current &&
          !viewerStoppedRef.current
        ) {

          renderAnimationRef.current =
            window.requestAnimationFrame(
              () => {
                renderAnimationRef.current =
                  null;

                void renderLatestFrame();
              },
            );
        }
      },
      [],
    );


  /*
   * =========================================================
   * SCHEDULE FRAME RENDER
   * =========================================================
   */

  const scheduleFrameRender =
    useCallback(() => {

      if (
        viewerStoppedRef.current ||
        renderingFrameRef.current ||
        renderAnimationRef.current !== null
      ) {
        return;
      }

      renderAnimationRef.current =
        window.requestAnimationFrame(
          () => {

            renderAnimationRef.current =
              null;

            void renderLatestFrame();
          },
        );
    }, [renderLatestFrame]);


  /*
   * =========================================================
   * CONNECT STREAM
   * =========================================================
   */

  useEffect(() => {

    if (
      !Number.isFinite(effectiveSessionId) ||
      effectiveSessionId <= 0
    ) {

      setRemoteStatus("error");

      setRemoteError(
        "Invalid remote session ID.",
      );

      return;
    }

    viewerStoppedRef.current =
      false;

    let disposed = false;

    const streamUrl =
      buildWebSocketUrl("/stream");

    const connectStream =
      () => {

        if (
          disposed ||
          viewerStoppedRef.current
        ) {
          return;
        }

        /*
         * Never create duplicate stream sockets.
         */

        const current =
          streamSocketRef.current;

        if (
          current &&
          (
            current.readyState === WebSocket.OPEN ||
            current.readyState === WebSocket.CONNECTING
          )
        ) {
          return;
        }

        console.log(
          "[REMOTE] Connecting viewer stream:",
          streamUrl,
        );

        let socket: WebSocket;

        try {

          socket =
            new WebSocket(streamUrl);

          socket.binaryType =
            "arraybuffer";

        } catch (error) {

          console.error(
            "[REMOTE] Failed to create stream socket:",
            error,
          );

          if (!disposed) {

            setRemoteStatus("error");

            setRemoteError(
              "Failed to create remote screen connection.",
            );

            streamRetryTimerRef.current =
              window.setTimeout(
                connectStream,
                STREAM_RETRY_MS,
              );
          }

          return;
        }

        streamSocketRef.current =
          socket;

        socket.onopen =
          () => {

            if (disposed) {
              return;
            }

            console.log(
              "[REMOTE] Screen stream connected",
            );

            setRemoteStatus("live");

            setRemoteError(null);
          };

        socket.onmessage =
          (event) => {

            if (
              disposed ||
              viewerStoppedRef.current
            ) {
              return;
            }

            let frame: Blob | null = null;

            if (
              event.data instanceof ArrayBuffer
            ) {

              frame =
                new Blob(
                  [event.data],
                  {
                    type: "image/jpeg",
                  },
                );

            } else if (
              event.data instanceof Blob
            ) {

              frame =
                event.data;
            }

            if (!frame) {
              return;
            }

            /*
             * Latest frame wins.
             *
             * This is critical for low-latency viewing.
             */

            pendingFrameRef.current =
              frame;

            scheduleFrameRender();
          };

        socket.onerror =
          (event) => {

            if (disposed) {
              return;
            }

            console.error(
              "[REMOTE] Screen stream error:",
              event,
            );

            /*
             * Do not immediately change the page to ERROR.
             * onclose will perform the reconnect.
             */
          };

        socket.onclose =
          (event) => {

            if (
              streamSocketRef.current ===
              socket
            ) {
              streamSocketRef.current =
                null;
            }

            if (
              disposed ||
              viewerStoppedRef.current
            ) {
              return;
            }

            console.log(
              "[REMOTE] Screen stream closed:",
              event.code,
              event.reason,
            );

            setRemoteStatus("connecting");

            setRemoteError(
              null,
            );

            streamRetryTimerRef.current =
              window.setTimeout(
                connectStream,
                STREAM_RETRY_MS,
              );
          };
      };


    connectStream();


    return () => {

      disposed = true;

      viewerStoppedRef.current =
        true;

      if (
        streamRetryTimerRef.current !==
        null
      ) {

        window.clearTimeout(
          streamRetryTimerRef.current,
        );

        streamRetryTimerRef.current =
          null;
      }

      if (
        renderAnimationRef.current !==
        null
      ) {

        window.cancelAnimationFrame(
          renderAnimationRef.current,
        );

        renderAnimationRef.current =
          null;
      }

      pendingFrameRef.current =
        null;

      const socket =
        streamSocketRef.current;

      streamSocketRef.current =
        null;

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
  ]);


  /*
   * =========================================================
   * CONNECT CONTROL
   * =========================================================
   */

  useEffect(() => {

    if (
      !Number.isFinite(effectiveSessionId) ||
      effectiveSessionId <= 0
    ) {
      return;
    }

    let disposed = false;

    const controlUrl =
      buildWebSocketUrl("/control");

    const connectControl =
      () => {

        if (
          disposed ||
          viewerStoppedRef.current
        ) {
          return;
        }

        const current =
          controlSocketRef.current;

        if (
          current &&
          (
            current.readyState === WebSocket.OPEN ||
            current.readyState === WebSocket.CONNECTING
          )
        ) {
          return;
        }

        console.log(
          "[CONTROL] Connecting viewer control:",
          controlUrl,
        );

        let socket: WebSocket;

        try {

          socket =
            new WebSocket(controlUrl);

        } catch (error) {

          console.error(
            "[CONTROL] Failed to create control socket:",
            error,
          );

          controlRetryTimerRef.current =
            window.setTimeout(
              connectControl,
              CONTROL_RETRY_MS,
            );

          return;
        }

        controlSocketRef.current =
          socket;

        socket.onopen =
          () => {

            console.log(
              "[CONTROL] Viewer control connected",
            );
          };

        socket.onerror =
          (event) => {

            console.error(
              "[CONTROL] Control socket error:",
              event,
            );
          };

        socket.onclose =
          (event) => {

            if (
              controlSocketRef.current ===
              socket
            ) {
              controlSocketRef.current =
                null;
            }

            if (
              disposed ||
              viewerStoppedRef.current
            ) {
              return;
            }

            console.log(
              "[CONTROL] Control socket closed:",
              event.code,
              event.reason,
            );

            controlRetryTimerRef.current =
              window.setTimeout(
                connectControl,
                CONTROL_RETRY_MS,
              );
          };
      };


    connectControl();


    return () => {

      disposed = true;

      if (
        controlRetryTimerRef.current !==
        null
      ) {

        window.clearTimeout(
          controlRetryTimerRef.current,
        );

        controlRetryTimerRef.current =
          null;
      }

      const socket =
        controlSocketRef.current;

      controlSocketRef.current =
        null;

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
  ]);


  /*
   * =========================================================
   * MOUSE MOVE
   * =========================================================
   */

  const handleMouseMove =
    useCallback(
      (
        event: MouseEvent<HTMLCanvasElement>,
      ) => {

        const coordinates =
          getRemoteCoordinates(event);

        if (!coordinates) {
          return;
        }

        latestMousePositionRef.current =
          coordinates;

        if (
          mouseMoveTimerRef.current !==
          null
        ) {
          return;
        }

        mouseMoveTimerRef.current =
          window.setTimeout(
            () => {

              mouseMoveTimerRef.current =
                null;

              const position =
                latestMousePositionRef.current;

              if (!position) {
                return;
              }

              sendRemoteCommand({
                type: "mouse_move",
                x: position.x,
                y: position.y,
              });
            },
            MOUSE_MOVE_INTERVAL_MS,
          );
      },
      [
        getRemoteCoordinates,
        sendRemoteCommand,
      ],
    );


  /*
   * =========================================================
   * LEFT CLICK
   * =========================================================
   */

  const handleClick =
    useCallback(
      (
        event: MouseEvent<HTMLCanvasElement>,
      ) => {

        event.preventDefault();

        const coordinates =
          getRemoteCoordinates(event);

        if (!coordinates) {
          return;
        }

        sendRemoteCommand({
          type: "mouse_click",
          x: coordinates.x,
          y: coordinates.y,
          button: "left",
          clicks: 1,
        });
      },
      [
        getRemoteCoordinates,
        sendRemoteCommand,
      ],
    );


  /*
   * =========================================================
   * DOUBLE CLICK
   * =========================================================
   */

  const handleDoubleClick =
    useCallback(
      (
        event: MouseEvent<HTMLCanvasElement>,
      ) => {

        event.preventDefault();

        const coordinates =
          getRemoteCoordinates(event);

        if (!coordinates) {
          return;
        }

        sendRemoteCommand({
          type: "mouse_click",
          x: coordinates.x,
          y: coordinates.y,
          button: "left",
          clicks: 2,
        });
      },
      [
        getRemoteCoordinates,
        sendRemoteCommand,
      ],
    );


  /*
   * =========================================================
   * RIGHT CLICK
   * =========================================================
   */

  const handleContextMenu =
    useCallback(
      (
        event: MouseEvent<HTMLCanvasElement>,
      ) => {

        event.preventDefault();

        const coordinates =
          getRemoteCoordinates(event);

        if (!coordinates) {
          return;
        }

        sendRemoteCommand({
          type: "mouse_click",
          x: coordinates.x,
          y: coordinates.y,
          button: "right",
          clicks: 1,
        });
      },
      [
        getRemoteCoordinates,
        sendRemoteCommand,
      ],
    );


  /*
 * =========================================================
 * SCROLL
 * =========================================================
 */

const handleWheel =
  useCallback(
    (
      event: WheelEvent<HTMLCanvasElement>,
    ) => {

      event.preventDefault();

      /*
       * Send scroll commands immediately.
       *
       * Browser wheel delta can vary significantly between
       * mouse wheels and trackpads, so normalize it into
       * useful Windows wheel units.
       */

      const rawDelta = event.deltaY;

      if (rawDelta === 0) {
        return;
      }

      /*
       * Convert browser delta into remote scroll units.
       *
       * Positive deltaY = scroll down
       * Negative deltaY = scroll up
       *
       * Increase the multiplier to make scrolling faster.
       */

      const amount = Math.max(
        -12,
        Math.min(
          12,
          Math.round(-rawDelta / 20),
        ),
      );

      if (amount === 0) {
        return;
      }

      sendRemoteCommand({
        type: "scroll",
        amount,
      });
    },
    [sendRemoteCommand],
  );


  /*
   * =========================================================
   * KEYBOARD
   * =========================================================
   */

  const handleKeyDown =
    useCallback(
      (
        event: KeyboardEvent<HTMLCanvasElement>,
      ) => {

        if (
          event.key === "Tab" ||
          event.key === "ArrowUp" ||
          event.key === "ArrowDown" ||
          event.key === "ArrowLeft" ||
          event.key === "ArrowRight" ||
          event.key === "PageUp" ||
          event.key === "PageDown" ||
          event.key === "Home" ||
          event.key === "End" ||
          event.key === " "
        ) {

          event.preventDefault();
        }

        if (event.repeat) {
          return;
        }

        const modifiers: string[] = [];

        if (event.ctrlKey) {
          modifiers.push("ctrl");
        }

        if (event.altKey) {
          modifiers.push("alt");
        }

        if (event.shiftKey) {
          modifiers.push("shift");
        }

        if (event.metaKey) {
          modifiers.push("win");
        }

        if (modifiers.length > 0) {

          sendRemoteCommand({
            type: "hotkey",
            keys: [
              ...modifiers,
              event.key.toLowerCase(),
            ],
          });

          return;
        }

        const keyMap: Record<string, string> = {
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
          Shift: "shift",
          Control: "ctrl",
          Alt: "alt",
        };

        const key =
          keyMap[event.key] ??
          event.key.toLowerCase();

        sendRemoteCommand({
          type: "key_press",
          key,
        });
      },
      [sendRemoteCommand],
    );


  /*
   * =========================================================
   * END SESSION
   * =========================================================
   */

  const endSession =
    async () => {

      if (
        !Number.isFinite(effectiveSessionId) ||
        effectiveSessionId <= 0
      ) {

        window.close();
        return;
      }

      viewerStoppedRef.current =
        true;

      setRemoteStatus("ended");

      if (
        mouseMoveTimerRef.current !==
        null
      ) {

        window.clearTimeout(
          mouseMoveTimerRef.current,
        );

        mouseMoveTimerRef.current =
          null;
      }

      if (
        wheelTimerRef.current !==
        null
      ) {

        window.clearTimeout(
          wheelTimerRef.current,
        );

        wheelTimerRef.current =
          null;
      }

      try {

        await disconnectRemoteSession(
          effectiveSessionId,
        );

      } catch (error) {

        console.error(
          "[REMOTE] Failed to end session:",
          error,
        );
      }

      const streamSocket =
        streamSocketRef.current;

      streamSocketRef.current =
        null;

      if (streamSocket) {

        try {
          streamSocket.close(1000, "session ended");
        } catch {
          // ignore
        }
      }

      const controlSocket =
        controlSocketRef.current;

      controlSocketRef.current =
        null;

      if (controlSocket) {

        try {
          controlSocket.close(1000, "session ended");
        } catch {
          // ignore
        }
      }

      pendingFrameRef.current =
        null;

      /*
       * Browser security may prevent window.close()
       * if this tab was not opened by script. In that
       * case the page remains visible as ENDED, but the
       * backend session is already strictly closed.
       */

      window.close();
    };


  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#07111f",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >

      <header
        style={{
          height: "58px",
          minHeight: "58px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          borderBottom:
            "1px solid rgba(255,255,255,0.08)",
          background: "#0b1727",
        }}
      >

        <div>

          <strong
            style={{
              fontSize: "16px",
            }}
          >
            TechPilot Remote Session
          </strong>

          <div
            style={{
              fontSize: "12px",
              opacity: 0.65,
              marginTop: "2px",
            }}
          >
            Remote Endpoint • Session #
            {effectiveSessionId}
          </div>

        </div>


        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >

          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color:
                remoteStatus === "live"
                  ? "#67e8f9"
                  : "#94a3b8",
            }}
          >
            ●{" "}
            {remoteStatus === "live"
              ? "LIVE"
              : remoteStatus === "ended"
              ? "ENDED"
              : remoteStatus === "error"
              ? "ERROR"
              : "CONNECTING"}
          </span>


          <button
            type="button"
            onClick={endSession}
            disabled={
              remoteStatus === "ended"
            }
            style={{
              border: "0",
              borderRadius: "8px",
              padding: "9px 15px",
              background: "#dc2626",
              color: "#ffffff",
              fontWeight: 700,
              cursor:
                remoteStatus === "ended"
                  ? "default"
                  : "pointer",
              opacity:
                remoteStatus === "ended"
                  ? 0.5
                  : 1,
            }}
          >
            End Session
          </button>

        </div>

      </header>


      <main
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "#02060b",
        }}
      >

        <div
          ref={screenRef}
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            outline: "none",
          }}
        >

          <canvas
            ref={canvasRef}
            tabIndex={0}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onMouseDown={() => {
              canvasRef.current?.focus();
            }}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              cursor: "default",
              userSelect: "none",
              WebkitUserSelect: "none",
              background: "#000000",
              display: "block",
            }}
          />

        </div>


        {remoteStatus !== "live" && (

          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              color: "#94a3b8",
              pointerEvents: "none",
            }}
          >

            <strong>
              {remoteStatus === "connecting"
                ? "Connecting to remote screen..."
                : remoteStatus === "error"
                ? "Remote screen unavailable"
                : "Remote session ended"}
            </strong>

            {remoteError && (
              <span
                style={{
                  fontSize: "12px",
                }}
              >
                {remoteError}
              </span>
            )}

          </div>

        )}

      </main>


      <footer
        style={{
          height: "42px",
          minHeight: "42px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderTop:
            "1px solid rgba(255,255,255,0.08)",
          background: "#0b1727",
          color: "#94a3b8",
          fontSize: "12px",
        }}
      >
        Mouse • Keyboard • Scroll • Remote Control
      </footer>

    </div>
  );
}