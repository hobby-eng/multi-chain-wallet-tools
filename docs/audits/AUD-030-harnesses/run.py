"""Reuse the workspace's bounded recorder without changing its retained evidence."""

from pathlib import Path
import fcntl
import os
import runpy
import sys

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/audits/AUD-030-evidence"


def recorder():
    """The sibling harness loads definitions only; all new evidence belongs here."""
    shared = ROOT.parent / "mnemocode/docs/audits/AUD-017-harnesses/run.py"
    guard = runpy.run_path(str(shared))["recorder"]()
    settings = guard.check.__globals__
    settings["ROOT"] = ROOT
    settings["EVIDENCE"] = EVIDENCE
    settings["TIMEOUT_SECONDS"] = int(os.environ.get("AUD030_TIMEOUT_SECONDS", "120"))
    if not 1 <= settings["TIMEOUT_SECONDS"] <= 300:
        raise ValueError("The targeted deadline must be between 1 and 300 seconds")
    # Retain the wallet audit's canonical file manifest rather than inventing a new binding.
    capture = runpy.run_path(str(ROOT / "docs/audits/AUD-028-harnesses/capture.py"))[
        "AuditCapture"
    ](ROOT, 30)
    guard.source = capture.source
    EVIDENCE.mkdir(exist_ok=True)
    return guard


if __name__ == "__main__":
    operation, label, *command = sys.argv[1:]
    if not label or not all(c.isalnum() or c == "-" for c in label):
        raise SystemExit("Choose a fresh alphanumeric/hyphen label")
    guard = recorder()
    if operation == "snapshot" and not command:
        guard.snapshot(label)
    elif operation == "check" and command:
        with open("/tmp/wallet-tools-heavy-check.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            raise SystemExit(guard.check(label, command))
    else:
        raise SystemExit("Usage: run.py snapshot LABEL | check LABEL COMMAND [ARGS]")
