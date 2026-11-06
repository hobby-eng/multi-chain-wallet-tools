"""Check the frozen baseline and procedure bytes without updating their manifests."""
import datetime
import hashlib
import json
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/AUD-034-evidence"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


snapshot = json.loads((OUT / "snapshot.json").read_text())
before = {row["path"]: row for row in snapshot["files"]}
catalog = subprocess.check_output(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=ROOT
).decode().split("\0")
current = {
    name for name in catalog
    if name and (ROOT / name).is_file() and not name.startswith("docs/audits/AUD-034")
}
missing = sorted(set(before) - current)
added = sorted(current - set(before))
changes = [
    {"path": name, "before": row["sha256"], "after": sha(ROOT / name)}
    for name, row in before.items()
    if (ROOT / name).is_file() and sha(ROOT / name) != row["sha256"]
]
source_changes = [row for row in changes if before[row["path"]]["kind"] != "historical-audit"]
procedures = []
for row in json.loads((OUT / "procedure-hashes.json").read_text()):
    path = pathlib.Path(row["path"].replace("/home/user", str(pathlib.Path.home())))
    actual = sha(path) if path.is_file() else None
    procedures.append({**row, "actual": actual, "matches": actual == row["sha256"]})
fingerprint_rows = [row for row in snapshot["files"] if row["kind"] != "historical-audit"]
fingerprint = hashlib.sha256("".join(
    f"{row['path']}\0{sha(ROOT / row['path'])}\n" for row in sorted(fingerprint_rows, key=lambda row: row["path"])
).encode()).hexdigest()
result = {
    "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "baselineFiles": len(before), "sourceFiles": len(fingerprint_rows),
    "missing": missing, "addedOutsideAudit34": added, "changedBaselineFiles": changes,
    "changedCurrentSourceFiles": source_changes, "sourceFingerprint": fingerprint,
    "expectedSourceFingerprint": snapshot["fingerprint"],
    "sourceMatches": fingerprint == snapshot["fingerprint"], "procedures": procedures,
    "policy": "Only audit34 outputs and an explicit audit-index publication addition are permitted. Original baseline manifest is never rewritten.",
}
(OUT / "final-source-identity.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({key: result[key] for key in ["baselineFiles", "sourceFiles", "missing", "addedOutsideAudit34", "changedBaselineFiles", "sourceMatches"]}))
unexpected_changes = [row for row in changes if row["path"] != "docs/audits/README.md"]
raise SystemExit(bool(missing or added or unexpected_changes or not result["sourceMatches"] or any(not row["matches"] for row in procedures)))
