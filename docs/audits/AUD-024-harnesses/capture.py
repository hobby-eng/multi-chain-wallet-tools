"""Capture bounded, read-only AUD-024 commands with exact times, exit codes and log hashes."""
import datetime
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/audits/AUD-024-evidence"
name, *command = sys.argv[1:]
if not name.replace("-", "").replace("_", "").isalnum() or not command:
    raise SystemExit("Usage: capture.py <safe-name> <command> [arguments]")
started = datetime.datetime.now(datetime.timezone.utc).isoformat()
result = subprocess.run(command, cwd=ROOT, capture_output=True)
log = result.stdout + result.stderr
(EVIDENCE / f"{name}.log").write_bytes(log)
record = {
    "command": command,
    "cwd": str(ROOT),
    "startedAtUtc": started,
    "endedAtUtc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "exitCode": result.returncode,
    "logSha256": hashlib.sha256(log).hexdigest(),
}
(EVIDENCE / f"{name}.command.json").write_text(json.dumps(record, indent=2) + "\n")
print(log.decode(errors="replace"), end="")
raise SystemExit(result.returncode)
