"""
Native Windows input injection via SendInput.

Replaces pyautogui for remote control because:

* pyautogui.FAILSAFE raised an exception whenever the remote cursor
  touched a screen corner, after which every command failed until
  the cursor moved away ("input stopped registering").
* pyautogui.write() typed with a 20 ms delay per character and could
  not type characters outside the US layout reliably.
* SendInput delivers a whole key combination atomically, which makes
  hotkeys (Ctrl+C, Alt+Tab, ...) reliable.

All coordinates here are absolute physical screen pixels.
"""

import ctypes
from ctypes import wintypes


# ---------------------------------------------------------------
# DPI awareness - must happen before any coordinate math so that
# capture (mss) and injection agree on physical pixels.
# ---------------------------------------------------------------

def _make_dpi_aware():
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
        return
    except Exception:
        pass
    try:
        ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


_make_dpi_aware()

user32 = ctypes.WinDLL("user32", use_last_error=True)

ULONG_PTR = ctypes.c_size_t

INPUT_MOUSE = 0
INPUT_KEYBOARD = 1

MOUSEEVENTF_MOVE = 0x0001
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004
MOUSEEVENTF_RIGHTDOWN = 0x0008
MOUSEEVENTF_RIGHTUP = 0x0010
MOUSEEVENTF_MIDDLEDOWN = 0x0020
MOUSEEVENTF_MIDDLEUP = 0x0040
MOUSEEVENTF_WHEEL = 0x0800
MOUSEEVENTF_HWHEEL = 0x1000
MOUSEEVENTF_VIRTUALDESK = 0x4000
MOUSEEVENTF_ABSOLUTE = 0x8000

KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_UNICODE = 0x0004

SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ULONG_PTR),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class _INPUTUNION(ctypes.Union):
    _fields_ = [
        ("mi", MOUSEINPUT),
        ("ki", KEYBDINPUT),
        ("hi", HARDWAREINPUT),
    ]


class INPUT(ctypes.Structure):
    _anonymous_ = ("u",)
    _fields_ = [
        ("type", wintypes.DWORD),
        ("u", _INPUTUNION),
    ]


user32.SendInput.argtypes = (wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int)
user32.SendInput.restype = wintypes.UINT
user32.VkKeyScanW.argtypes = (wintypes.WCHAR,)
user32.VkKeyScanW.restype = ctypes.c_short


def _send(inputs):
    if not inputs:
        return
    array = (INPUT * len(inputs))(*inputs)
    sent = user32.SendInput(len(inputs), array, ctypes.sizeof(INPUT))
    if sent != len(inputs):
        # Usually UIPI: the foreground window is elevated (Task Manager,
        # an admin console, ...) and the agent is not.
        raise OSError(
            f"SendInput blocked ({sent}/{len(inputs)}), "
            f"error {ctypes.get_last_error()}"
        )


def _mouse(flags, dx=0, dy=0, data=0):
    item = INPUT(type=INPUT_MOUSE)
    item.mi = MOUSEINPUT(dx, dy, data & 0xFFFFFFFF, flags, 0, 0)
    return item


def _key(vk=0, scan=0, flags=0):
    item = INPUT(type=INPUT_KEYBOARD)
    item.ki = KEYBDINPUT(vk, scan, flags, 0, 0)
    return item


# ---------------------------------------------------------------
# MOUSE
# ---------------------------------------------------------------

def _absolute(x, y):
    vx = user32.GetSystemMetrics(SM_XVIRTUALSCREEN)
    vy = user32.GetSystemMetrics(SM_YVIRTUALSCREEN)
    vw = max(2, user32.GetSystemMetrics(SM_CXVIRTUALSCREEN))
    vh = max(2, user32.GetSystemMetrics(SM_CYVIRTUALSCREEN))

    nx = int(round((x - vx) * 65535 / (vw - 1)))
    ny = int(round((y - vy) * 65535 / (vh - 1)))

    return max(0, min(65535, nx)), max(0, min(65535, ny))


def _move_input(x, y):
    nx, ny = _absolute(x, y)
    return _mouse(
        MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK,
        nx,
        ny,
    )


_BUTTON_FLAGS = {
    "left": (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
    "right": (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
    "middle": (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
}


def mouse_move(x, y):
    _send([_move_input(x, y)])


def mouse_button(button, down, x=None, y=None):
    flags = _BUTTON_FLAGS.get(button, _BUTTON_FLAGS["left"])
    inputs = []
    if x is not None and y is not None:
        inputs.append(_move_input(x, y))
    inputs.append(_mouse(flags[0] if down else flags[1]))
    _send(inputs)


def mouse_click(button, x=None, y=None, clicks=1):
    flags = _BUTTON_FLAGS.get(button, _BUTTON_FLAGS["left"])
    inputs = []
    if x is not None and y is not None:
        inputs.append(_move_input(x, y))
    for _ in range(max(1, int(clicks))):
        inputs.append(_mouse(flags[0]))
        inputs.append(_mouse(flags[1]))
    _send(inputs)


def scroll(delta, horizontal=False):
    """delta in Windows wheel units (120 = one notch, + = up/right)."""
    delta = int(delta)
    if delta == 0:
        return
    flag = MOUSEEVENTF_HWHEEL if horizontal else MOUSEEVENTF_WHEEL
    _send([_mouse(flag, data=delta)])


# ---------------------------------------------------------------
# KEYBOARD
# ---------------------------------------------------------------

VK = {
    "backspace": 0x08, "tab": 0x09, "enter": 0x0D, "return": 0x0D,
    "shift": 0x10, "ctrl": 0x11, "control": 0x11, "alt": 0x12,
    "pause": 0x13, "capslock": 0x14, "esc": 0x1B, "escape": 0x1B,
    "space": 0x20, "pageup": 0x21, "pagedown": 0x22, "end": 0x23,
    "home": 0x24, "left": 0x25, "up": 0x26, "right": 0x27, "down": 0x28,
    "printscreen": 0x2C, "insert": 0x2D, "delete": 0x2E, "del": 0x2E,
    "win": 0x5B, "meta": 0x5B, "apps": 0x5D, "numlock": 0x90,
    "scrolllock": 0x91,
}
VK.update({f"f{i}": 0x6F + i for i in range(1, 25)})

# Keys that need KEYEVENTF_EXTENDEDKEY, otherwise e.g. the arrows
# behave like numpad keys when NumLock is on.
EXTENDED = {
    0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28,
    0x2C, 0x2D, 0x2E, 0x5B, 0x5D, 0x90,
}


def _vk_for(name):
    name = str(name)
    lowered = name.lower()

    if lowered in VK:
        return VK[lowered]

    if len(name) == 1:
        result = user32.VkKeyScanW(name)
        if result != -1:
            return result & 0xFF

    raise ValueError(f"Unknown key: {name!r}")


def _vk_inputs(vk, up):
    flags = KEYEVENTF_KEYUP if up else 0
    if vk in EXTENDED:
        flags |= KEYEVENTF_EXTENDEDKEY
    return _key(vk=vk, flags=flags)


def key_press(name):
    vk = _vk_for(name)
    _send([_vk_inputs(vk, False), _vk_inputs(vk, True)])


def hotkey(names):
    vks = [_vk_for(n) for n in names]
    inputs = [_vk_inputs(vk, False) for vk in vks]
    inputs += [_vk_inputs(vk, True) for vk in reversed(vks)]
    _send(inputs)


def type_text(text):
    """Types any Unicode text, independent of the keyboard layout."""
    inputs = []

    for char in str(text):
        if char in ("\n", "\r"):
            inputs.append(_vk_inputs(0x0D, False))
            inputs.append(_vk_inputs(0x0D, True))
            continue
        if char == "\t":
            inputs.append(_vk_inputs(0x09, False))
            inputs.append(_vk_inputs(0x09, True))
            continue

        encoded = char.encode("utf-16-le")
        for i in range(0, len(encoded), 2):
            unit = int.from_bytes(encoded[i:i + 2], "little")
            inputs.append(_key(scan=unit, flags=KEYEVENTF_UNICODE))
            inputs.append(_key(scan=unit, flags=KEYEVENTF_UNICODE | KEYEVENTF_KEYUP))

    _send(inputs)
