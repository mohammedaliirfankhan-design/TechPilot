import io

import mss
from PIL import Image


class ScreenCapture:

    def __init__(self, monitor=1, quality=60):
        self.monitor = monitor
        self.quality = quality
        self.sct = mss.mss()

        print("[SCREEN] Available monitors:")

        for i, monitor_info in enumerate(self.sct.monitors):
            print(
                f"[SCREEN] Monitor {i}: "
                f"{monitor_info}"
            )

        print(
            f"[SCREEN] Using monitor: {self.monitor}"
        )

    def capture(self) -> bytes:

        screenshot = self.sct.grab(
            self.sct.monitors[self.monitor]
        )

        image = Image.frombuffer(
    "RGB",
    screenshot.size,
    screenshot.bgra,
    "raw",
    "BGRX",
    0,
    1,
)

        buffer = io.BytesIO()

        image.save(
            buffer,
            format="JPEG",
            quality=self.quality
        )

        return buffer.getvalue()

    def close(self):

        self.sct.close()