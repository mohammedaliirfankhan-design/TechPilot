import io

import mss
from PIL import Image


class ScreenCapture:

    def __init__(self, monitor=1, quality=60):
        self.monitor = monitor
        self.quality = quality
        self.sct = mss.mss()

    def capture(self) -> bytes:
        screenshot = self.sct.grab(
            self.sct.monitors[self.monitor]
        )

        image = Image.frombytes(
            "RGB",
            screenshot.size,
            screenshot.rgb
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