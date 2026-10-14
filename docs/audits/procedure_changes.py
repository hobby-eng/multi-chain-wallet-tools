"""Checks a procedure file against the SHA-256 an audit record pinned, across later edits.

An audit record pins the SHA-256 of each procedure file it followed. When the owner edits one of
those files later, procedure-changes.json next to this script records the edit with its exact
reverse edit. matches_audited() undoes the recorded edits, newest first, until the bytes either
reach the pinned hash or no recorded edit applies.

Every validator under docs/audits/AUD-NNN-harnesses/ calls this one helper, so that a later edit is
recorded once. Command line, for validators written in JavaScript:

    python3 -B docs/audits/procedure_changes.py <path> <pinned-sha256>

exits 0 when the file at <path> is the pinned version or recovers it, and 1 otherwise.
"""

import hashlib
import json
import sys
from pathlib import Path

REPOSITORY = Path(__file__).resolve().parents[2]
CHANGES = Path(__file__).with_name("procedure-changes.json")


def _sha256(data):
    return hashlib.sha256(data).hexdigest()


def _undo(data, edit):
    current = edit["current"].encode()
    if data.count(current) != 1:
        return None
    return data.replace(current, edit["audited"].encode())


def matches_audited(path, pinned_sha256):
    """True when the file at path is the pinned version or recorded edits recover it."""
    path = Path(path).resolve()
    data = path.read_bytes()
    name = path.relative_to(REPOSITORY).as_posix()
    changes = [item for item in json.loads(CHANGES.read_text())["changes"] if item["file"] == name]
    while _sha256(data) != pinned_sha256:
        change = next((item for item in changes if item["currentSha256"] == _sha256(data)), None)
        if change is None:
            return False
        changes.remove(change)
        data = _undo(data, change["reverseEdit"])
        if data is None or _sha256(data) != change["auditedSha256"]:
            return False
    return True


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: python3 -B docs/audits/procedure_changes.py <path> <pinned-sha256>")
    sys.exit(0 if matches_audited(sys.argv[1], sys.argv[2]) else 1)
