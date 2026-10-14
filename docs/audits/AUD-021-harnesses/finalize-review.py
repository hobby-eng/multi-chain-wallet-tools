"""Validate paired audit records, reviewed identity and retained local evidence."""

import datetime
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

import jsonschema

# Procedure files edited after this audit are checked through docs/audits/procedure_changes.py.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from procedure_changes import matches_audited  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
AUDITS = ROOT / "docs/audits"
EVIDENCE = AUDITS / "AUD-021-evidence"
started = datetime.datetime.now(datetime.timezone.utc).isoformat()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f"Duplicate JSON key: {key}"
        result[key] = value
    return result


report_path = AUDITS / "AUD-021-2026-10-03.json"
report = json.loads(report_path.read_text(), object_pairs_hook=unique_object)
markdown_path = report_path.with_suffix(".md")
markdown = markdown_path.read_text()
jsonschema.validate(report, json.loads((ROOT / "docs/audit-report.schema.json").read_text()))
ids = [row["id"] for row in report["findings"]]
assert len(ids) == len(set(ids)) == 2
assert all(identifier in markdown for identifier in ids)
assert set(ids) == {row["id"] for row in report["remediation"]}
assert report["findings"][0]["severity"] == "medium"
assert report["findings"][1]["severity"] == "low"
assert all(row["status"] == "open" for row in report["findings"])
guide_ids = set(re.findall(r"^### (CHECK-[A-Z]+-[0-9]{3}) —", (ROOT / "docs/FULL_AUDIT_GUIDE.md").read_text(), re.M))
ledger_ids = [row["checkId"] for row in report["checks"]["coverageLedger"]]
assert len(ledger_ids) == len(set(ledger_ids)) == 32
assert set(ledger_ids) == guide_ids

snapshot = json.loads((EVIDENCE / "snapshot.json").read_text())
assert subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip() == snapshot["commit"]
for name, expected in snapshot["files"].items():
    if name == "docs/audits/README.md":
        continue  # Only the new report index entry is allowed in an existing tracked file.
    assert digest(ROOT / name) == expected, f"Reviewed source changed: {name}"
index_diff = subprocess.check_output(["git", "diff", "--", "docs/audits/README.md"], cwd=ROOT, text=True)
assert len([line for line in index_diff.splitlines() if line.startswith("+") and not line.startswith("+++")]) == 1
assert "+21. [AUD-021]" in index_diff
assert not [line for line in index_diff.splitlines() if line.startswith("-") and not line.startswith("---")]
for name, expected in report["procedure"].items():
    assert matches_audited(ROOT / name, expected), name
for name, expected in report["snapshot"]["artifacts"].items():
    assert digest(ROOT / "dist" / name) == expected, name
    assert digest(EVIDENCE / "canonical-output/dist" / name) == expected, name
for path in EVIDENCE.glob("*.command.json"):
    record = json.loads(path.read_text(), object_pairs_hook=unique_object)
    assert digest(EVIDENCE / record["log"]) == record["logSha256"], path
for target in re.findall(r"\]\(([^)]+)\)", markdown):
    assert (AUDITS / target).exists(), target
assert "Displayed metadata comparison: 0 PASS, 6 FAIL" in (EVIDENCE / "displayed-build-metadata.log").read_text()
assert '"emitted":22,"cancelled":false' in (EVIDENCE / "public-provider-availability.log").read_text()
assert "1 passed" in (EVIDENCE / "printed-card-text.log").read_text()
assert subprocess.run(["git", "check-ignore", "--quiet", "docs/audits/AUD-021-evidence/snapshot.json"], cwd=ROOT).returncode == 0
assert not subprocess.check_output(["git", "diff", "--cached", "--name-only"], cwd=ROOT, text=True).strip()

validation = {
    "auditId": "AUD-021", "validatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "schemaValid": True, "uniqueFindings": len(ids), "coverageIds": len(ledger_ids),
    "reviewedFilesUnchangedExceptAuditIndex": True, "procedureHashesValid": True,
    "logHashesValid": True, "eightNativeCanonicalHashesMatch": True,
    "reportHashes": {path.name: digest(path) for path in (report_path, markdown_path)},
    "assessment": "One medium and one low open finding; recorded passing checks do not approve release of the affected connected tools.",
}
(EVIDENCE / "report-validation.json").write_text(json.dumps(validation, indent=2) + "\n")
message = "PASS AUD-021: schema, paired findings, 32 CHECK IDs, source/procedure/log/artifact hashes, evidence ignore rule and report links.\n"
log_path = EVIDENCE / "final-validation.log"
log_path.write_text(message)
record = {"argv": [sys.executable, str(Path(__file__).relative_to(ROOT))],
          "workingDirectory": str(ROOT), "startedAt": started,
          "completedAt": validation["validatedAt"], "exitCode": 0,
          "log": log_path.name, "logSha256": digest(log_path)}
(EVIDENCE / "final-validation.command.json").write_text(json.dumps(record, indent=2) + "\n")
manifest = "".join(f"{digest(path)}  {path.relative_to(EVIDENCE).as_posix()}\n"
                   for path in sorted(EVIDENCE.rglob("*")) if path.is_file() and path.name != "SHA256SUMS")
(EVIDENCE / "SHA256SUMS").write_text(manifest)
print(message, end="")
