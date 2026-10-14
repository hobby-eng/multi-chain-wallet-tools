"""Format only source paths changed after the authorized remediation baseline."""

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "AUD-027-harnesses"))
from capture import ReviewCommand


if __name__ == "__main__":
    name, mode = sys.argv[1:]
    if mode not in {"write", "check"}:
        raise SystemExit("Usage: format-remediation.py <fresh-record-name> <write|check>")
    recorder = ReviewCommand(name, [], audit_number=26)
    baseline = json.loads((recorder.evidence / "remediation-baseline.json").read_text())
    before = {item["path"]: item["sha256"] for item in baseline["files"]}
    extensions = {".ts", ".mjs", ".json", ".md", ".yml", ".yaml", ".css", ".html"}
    paths = [
        item["path"]
        for item in recorder.source()["files"]
        if before.get(item["path"]) != item["sha256"]
        and pathlib.Path(item["path"]).suffix in extensions
    ]
    recorder.command = ["pnpm", "exec", "prettier", f"--{mode}", *paths]
    raise SystemExit(recorder.run())
