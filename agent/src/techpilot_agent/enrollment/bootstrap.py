
import argparse
import json
import os
import platform
import sys

import requests

from techpilot_agent.identity.device_id import (
    generate_device_id,
    save_device_id,
)


AGENT_VERSION = "1.1.0"


def write_enrollment_result(
    result_file: str,
    backend_url: str,
    agent_token: str,
) -> None:
    result_path = os.path.abspath(result_file)

    result = {
        "backend_url": backend_url.rstrip("/"),
        "agent_token": agent_token,
    }

    with open(
        result_path,
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(
            result,
            file,
            ensure_ascii=True,
        )


def complete_enrollment(
    backend_url: str,
    enrollment_code: str,
    result_file: str,
) -> None:
    backend_url = backend_url.rstrip("/")

    # Generate a candidate identity without modifying the existing one.
    device_id = generate_device_id()

    payload = {
        "enrollment_code": enrollment_code.strip().upper(),
        "device_id": device_id,
        "hostname": platform.node(),
        "operating_system": platform.system(),
        "os_version": platform.version(),
        "agent_version": AGENT_VERSION,
    }

    print("Connecting to TechAIPILOT backend...")
    print(f"Registering new device identity: {device_id}")

    response = requests.post(
        f"{backend_url}/api/v1/device-enrollments/complete",
        json=payload,
        timeout=15,
    )

    if response.status_code != 200:
        try:
            detail = response.json().get(
                "detail",
                "Device enrollment failed.",
            )
        except ValueError:
            detail = "Device enrollment failed."

        raise RuntimeError(
            f"{detail} (HTTP {response.status_code})"
        )

    try:
        result = response.json()
    except ValueError as exc:
        raise RuntimeError(
            "The server returned an invalid enrollment response."
        ) from exc

    if result.get("status") != "enrolled":
        raise RuntimeError(
            "The server did not confirm successful enrollment."
        )

    if result.get("device_id") != device_id:
        raise RuntimeError(
            "The server returned a different device ID."
        )

    agent_token = result.get("agent_token", "")

    if not agent_token.startswith("tpa_"):
        raise RuntimeError(
            "The server returned an invalid Agent credential."
        )

    # Only replace the saved identity after the backend confirms enrollment.
    # The previous identity is automatically backed up by save_device_id().
    save_device_id(device_id)

    write_enrollment_result(
        result_file=result_file,
        backend_url=backend_url,
        agent_token=agent_token,
    )

    print(
        json.dumps(
            {
                "status": "enrolled",
                "device_id": device_id,
                "message": "Device enrolled successfully.",
            }
        )
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description="TechAIPILOT device enrollment bootstrap."
    )

    parser.add_argument(
        "--backend-url",
        required=True,
        help="TechAIPILOT backend URL.",
    )

    parser.add_argument(
        "--enrollment-code",
        required=True,
        help="One-time TechAIPILOT enrollment code.",
    )

    parser.add_argument(
        "--result-file",
        required=True,
        help="Temporary file where the enrollment result is written.",
    )

    return parser.parse_args()


def main() -> int:
    try:
        args = parse_args()

        complete_enrollment(
            backend_url=args.backend_url,
            enrollment_code=args.enrollment_code,
            result_file=args.result_file,
        )

        return 0

    except requests.RequestException as exc:
        print(
            f"Enrollment connection failed: {exc}",
            file=sys.stderr,
        )
        return 1

    except Exception as exc:
        print(
            f"Enrollment failed: {exc}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
