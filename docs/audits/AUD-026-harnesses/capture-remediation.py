"""Use the shared bounded recorder for the later authorized AUD-026 remediation."""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "AUD-027-harnesses"))
from capture import ReviewCommand

if __name__ == "__main__":
    name, *command = sys.argv[1:]
    if not name.replace("-", "").replace("_", "").isalnum() or not command:
        raise SystemExit("Usage: capture-remediation.py <fresh-name> <command> [arguments]")
    raise SystemExit(ReviewCommand(name, command, audit_number=26).run())
