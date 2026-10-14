"""Hash the live checkout without creating a second working tree."""
import hashlib
import json
import subprocess
import argparse
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/audits/AUD-026-evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--name", default="", help="Unique suffix for a later snapshot")
args = parser.parse_args()
if args.name and not all(character.isalnum() or character == "-" for character in args.name):
    parser.error("Snapshot names contain only letters, digits, and hyphens")
suffix = f"-{args.name}" if args.name else ""

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
snapshot = {
    "capturedAt": datetime.now(timezone.utc).isoformat(),
    "commit": git("rev-parse", "HEAD").decode().strip(),
    "workingTree": git("status", "--porcelain").decode(),
    "sourceFingerprint": fingerprint,
    "files": files,
}
with (EVIDENCE / f"snapshot{suffix}.json").open("x") as destination:
    destination.write(json.dumps(snapshot, indent=2) + "\n")
with (EVIDENCE / f"pre-existing{suffix}.diff").open("xb") as destination:
    destination.write(git("diff", "HEAD", "--", ".", ":!docs/audits/AUD-026-*"))
procedures = ["docs/FULL_AUDIT_GUIDE.md", "docs/audits/AUDIT_STANDARD.md", "docs/audits/AUDIT_TEMPLATE.md", "docs/audit-report.schema.json"]
with (EVIDENCE / f"procedure-hashes{suffix}.json").open("x") as destination:
    destination.write(json.dumps({p: files[p] for p in procedures}, indent=2) + "\n")
print(json.dumps({"commit": snapshot["commit"], "sourceFingerprint": fingerprint, "files": len(files)}))
