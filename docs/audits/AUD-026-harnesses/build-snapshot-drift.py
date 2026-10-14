"""AUD-026 build reviewer: compares the live checkout with the AUD-026 baseline snapshot using the same
file set and hashing as capture-snapshot.py, without writing a snapshot, and lists every path that was
added, removed or changed, plus the current HEAD. Exit 1 when anything differs.
Run: python3 docs/audits/AUD-026-harnesses/build-snapshot-drift.py
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
baseline = json.loads((ROOT / "docs/audits/AUD-026-evidence/snapshot-baseline.json").read_text())


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


files = {}
for raw in sorted(set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0"))):
    if not raw:
        continue
    name = raw.decode()
    if "AUD-026-" in name or "audit-26-" in name:
        continue
    target = ROOT / name
    files[name] = hashlib.sha256(target.read_bytes()).hexdigest() if target.is_file() else None
fingerprint = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()
old = baseline["files"]
added = sorted(set(files) - set(old))
removed = sorted(set(old) - set(files))
changed = sorted(name for name in files if name in old and files[name] != old[name])
print(f"baseline HEAD {baseline['commit']} fingerprint {baseline['sourceFingerprint']}")
print(f"current  HEAD {git('rev-parse', 'HEAD').decode().strip()} fingerprint {fingerprint}")
for label, names in (("added", added), ("removed", removed), ("changed", changed)):
    print(f"{label}: {len(names)}")
    for name in names:
        print(f"  {name}")
sys.exit(1 if added or removed or changed else 0)
