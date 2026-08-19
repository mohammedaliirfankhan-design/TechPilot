import platform

import psutil


def collect_telemetry() -> dict:
    """
    Collect basic endpoint health telemetry.
    """

    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return {
        "hostname": platform.node(),
        "operating_system": platform.system(),
        "os_version": platform.version(),
        "cpu_percent": psutil.cpu_percent(interval=1),
        "memory_percent": memory.percent,
        "disk_percent": disk.percent,
    }