import io
import threading
import zlib

import mss
from PIL import Image


_RESAMPLE = getattr(Image, "Resampling", Image).BILINEAR


class ScreenCapture:
    """
    Captures the screen, downscales it and JPEG-encodes it.

    Changes compared to the previous version:

    * The mss instance is created lazily in the thread that captures.
      mss keeps GDI handles in thread-local storage on Windows, so
      creating it in one thread and grabbing in another causes random
      "srcdc" errors and stream reconnects.
    * Frames wider than max_width are downscaled. A full 1920x1080
      JPEG is 150-300 KB; at 1600 px wide it is roughly half that,
      which matters a lot over the internet.
    * Unchanged screens are skipped entirely (no bandwidth used while
      the remote screen is static).
    * Resolution / monitor changes are handled by re-creating mss.
    """

    def __init__(
        self,
        monitor: int = 1,
        quality: int = 55,
        max_width: int = 1600,
    ):
        self.monitor_index = monitor
        self.quality = quality
        self.max_width = max_width

        self._local = threading.local()
        self._last_digest = None

    # ---------------------------------------------------------

    def _sct(self):
        sct = getattr(self._local, "sct", None)

        if sct is None:
            sct = mss.mss()
            self._local.sct = sct

            if self.monitor_index >= len(sct.monitors):
                self.monitor_index = 1

            print(
                f"[SCREEN] Using monitor {self.monitor_index}: "
                f"{sct.monitors[self.monitor_index]}",
                flush=True,
            )

        return sct

    def _reset(self):
        sct = getattr(self._local, "sct", None)

        if sct is not None:
            try:
                sct.close()
            except Exception:
                pass

        self._local.sct = None

    @property
    def geometry(self) -> dict:
        monitor = self._sct().monitors[self.monitor_index]

        return {
            "left": monitor["left"],
            "top": monitor["top"],
            "width": monitor["width"],
            "height": monitor["height"],
        }

    # ---------------------------------------------------------

    def grab(self, force: bool = False):
        """
        Return (jpeg_bytes, width, height), or None when the screen
        has not changed since the previous frame (unless force=True).
        """
        try:
            sct = self._sct()
            shot = sct.grab(sct.monitors[self.monitor_index])

        except Exception as exc:
            print(
                f"[SCREEN] Capture failed, re-initialising: "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )
            self._reset()
            raise

        digest = zlib.adler32(shot.bgra)

        if not force and digest == self._last_digest:
            return None

        self._last_digest = digest

        image = Image.frombuffer(
            "RGB",
            shot.size,
            shot.bgra,
            "raw",
            "BGRX",
            0,
            1,
        )

        width, height = image.size

        if width > self.max_width:
            height = max(1, round(height * self.max_width / width))
            width = self.max_width
            image = image.resize(
                (width, height),
                _RESAMPLE,
                reducing_gap=2.0,
            )

        buffer = io.BytesIO()

        image.save(
            buffer,
            format="JPEG",
            quality=int(self.quality),
            optimize=False,
            subsampling=2,
        )

        return buffer.getvalue(), width, height

    # Backwards compatible API
    def capture(self) -> bytes:
        result = self.grab(force=True)
        return result[0]

    def close(self):
        self._reset()
