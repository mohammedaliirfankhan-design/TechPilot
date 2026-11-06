"""
Shared per-session state between the screen streamer and the control client.

Why this exists
---------------
The old streamer pushed frames at a fixed 18 FPS no matter how fast the
network could deliver them. When the path (agent -> Render -> browser)
was slower than that, frames piled up in TCP buffers and in the relay,
so the viewer was always looking at a picture that was seconds old and
every click "arrived late".

Now the viewer acknowledges every frame it draws (over the existing
control channel, so the backend needs no change). The streamer only
allows a small number of un-acknowledged frames in flight. If the
network is slow, the frame rate drops automatically instead of the
latency growing.
"""

from __future__ import annotations

import threading
import time
from collections import deque


class SessionLink:

    def __init__(self, session_id: int):
        self.session_id = session_id

        self._cond = threading.Condition()

        self._next_seq = 0
        self.last_sent_seq = 0
        self.last_acked_seq = 0

        # True once at least one ack arrived in this session.
        # Until then the streamer uses simple time-based pacing,
        # so an older frontend still works.
        self.ack_seen = False

        self._send_times: dict[int, float] = {}
        self._rtts: deque[float] = deque(maxlen=20)

        self._keyframe_requested = True

        # Geometry of the monitor being streamed (physical pixels)
        # and the size of the frames being sent. The control client
        # uses this to map viewer coordinates to the real screen.
        self.monitor: dict | None = None
        self.frame_size: tuple[int, int] | None = None

    # ---------------------------------------------------------
    # SEQUENCE / ACK
    # ---------------------------------------------------------

    def next_seq(self) -> int:
        with self._cond:
            self._next_seq = (self._next_seq + 1) & 0xFFFFFFFF
            return self._next_seq

    def on_sent(self, seq: int) -> None:
        with self._cond:
            self.last_sent_seq = seq
            self._send_times[seq] = time.perf_counter()

            if len(self._send_times) > 64:
                for old in sorted(self._send_times)[:-32]:
                    self._send_times.pop(old, None)

    def on_ack(self, seq: int) -> None:
        with self._cond:
            if seq <= self.last_acked_seq:
                return

            self.last_acked_seq = min(seq, self.last_sent_seq)
            self.ack_seen = True

            sent_at = self._send_times.pop(seq, None)

            if sent_at is not None:
                self._rtts.append(time.perf_counter() - sent_at)

            for old in [s for s in self._send_times if s <= seq]:
                self._send_times.pop(old, None)

            self._cond.notify_all()

    def in_flight(self) -> int:
        return max(0, self.last_sent_seq - self.last_acked_seq)

    def wait_for_window(
        self,
        max_in_flight: int,
        timeout: float,
    ) -> bool:
        """Block until fewer than max_in_flight frames are un-acked."""
        with self._cond:
            return self._cond.wait_for(
                lambda: self.in_flight() < max_in_flight,
                timeout=timeout,
            )

    def forgive(self) -> None:
        """
        Treat everything sent so far as delivered.

        Used when the viewer (re)connects or when acks stop
        arriving, so the streamer can never deadlock.
        """
        with self._cond:
            self.last_acked_seq = self.last_sent_seq
            self._send_times.clear()
            self._cond.notify_all()

    def average_rtt(self) -> float | None:
        with self._cond:
            if not self._rtts:
                return None
            return sum(self._rtts) / len(self._rtts)

    # ---------------------------------------------------------
    # KEYFRAMES
    # ---------------------------------------------------------

    def request_keyframe(self) -> None:
        with self._cond:
            self._keyframe_requested = True
            self._cond.notify_all()

    def consume_keyframe_request(self) -> bool:
        with self._cond:
            requested = self._keyframe_requested
            self._keyframe_requested = False
            return requested

    def on_viewer_ready(self) -> None:
        self.forgive()
        self.request_keyframe()


_links: dict[int, SessionLink] = {}
_links_lock = threading.Lock()


def get_link(session_id: int) -> SessionLink:
    with _links_lock:
        link = _links.get(int(session_id))

        if link is None:
            link = SessionLink(int(session_id))
            _links[int(session_id)] = link

        return link


def drop_link(session_id: int) -> None:
    with _links_lock:
        _links.pop(int(session_id), None)
