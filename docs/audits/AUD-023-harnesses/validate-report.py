"""Validate the AUD-023 records and the retained local evidence; never modify product source.

Copied from docs/audits/AUD-022-harnesses/validate-report.py with the evidence folder changed, the
remediation source fingerprint checked as well, the finding source hashes read relative to the
repository root, and the interrupted records that the report names accepted with both log hashes.

Run: python3 docs/audits/AUD-023-harnesses/validate-report.py docs/audits/audit-23-<date>.json
"""
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

import jsonschema

# Procedure files edited after this audit are checked through docs/audits/procedure_changes.py.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from procedure_changes import matches_audited  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs/audits/AUD-023-evidence"


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


path = Path(sys.argv[1]).resolve()
report = json.loads(path.read_text(), object_pairs_hook=unique_pairs)
schema = json.loads((ROOT / "docs/audit-report.schema.json").read_text())
jsonschema.Draft202012Validator(schema).validate(report)
markdown = path.with_suffix(".md")
text = markdown.read_text()
ids = [item["id"] for item in report["findings"]]
assert len(ids) == len(set(ids)), "Duplicate finding IDs"
headings = re.findall(r"^#### (AUD-\d+-(?:SEC|FUN|API|BLD|DOC|UI|ARC)\d+) — (\w+) — (.+)$", text, re.M)
assert {row[0] for row in headings} == set(ids), "Paired finding IDs differ"
# Markdown formatters align columns with spaces; compare cells instead of raw lines.
table_rows = {
    tuple(cell.strip() for cell in line.strip().strip("|").split("|"))
    for line in text.splitlines()
    if line.lstrip().startswith("|")
}
for finding in report["findings"]:
    assert (finding["id"], finding["severity"].capitalize(), finding["title"]) in headings
    assert finding["id"].split("-")[-1].startswith(finding["category"])
    assert (
        finding["id"],
        finding["category"],
        finding["severity"],
        finding["status"],
        str(finding["releaseBlocking"]).lower(),
        finding["title"],
    ) in table_rows, f"Paired finding table differs: {finding['id']}"
assert report["snapshot"]["commit"] in text
assert report["snapshot"]["sourceFingerprint"] in text
assert report["snapshot"]["remediationSourceFingerprint"] in text
assert report["date"] in text
expected_checks = set(re.findall(r"^### (CHECK-[A-Z]+-\d+) ", (ROOT / "docs/FULL_AUDIT_GUIDE.md").read_text(), re.M))
actual_checks = [row["checkId"] for row in report["checks"]["coverage"]]
assert len(actual_checks) == 32 and set(actual_checks) == expected_checks
for target in re.findall(r"\]\(([^)]+)\)", text):
    if target.startswith(("https://", "http://", "#")):
        continue
    location = unquote(target.split("#")[0])
    assert (markdown.parent / location).exists(), f"Missing Markdown link: {target}"
# A run stopped by hand may have had its log extended after the record was written; the report
# names each such record with both hashes, and nothing else may differ.
interrupted = {item["name"]: item for item in report.get("interruptedRecords", [])}
for record in EVIDENCE.glob("*.command.json"):
    data = json.loads(record.read_text(), object_pairs_hook=unique_pairs)
    actual = hashlib.sha256((EVIDENCE / data["log"]).read_bytes()).hexdigest()
    name = record.name.removesuffix(".command.json")
    if name in interrupted:
        assert interrupted[name]["recordedLogSha256"] == data["logSha256"], record
        assert interrupted[name]["currentLogSha256"] == actual, record
        continue
    assert actual == data["logSha256"], record
for name, expected in report["procedure"].items():
    assert matches_audited(ROOT / name, expected), name
for name, expected in report["findingSourceHashes"].items():
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
for name, expected in report["snapshot"]["artifacts"].items():
    assert hashlib.sha256((ROOT / "dist" / name).read_bytes()).hexdigest() == expected, name
staged = subprocess.check_output(["git", "diff", "--cached", "--name-only"], cwd=ROOT).decode().splitlines()
assert not any("-evidence/" in name for name in staged), "Evidence was staged"
result = {"valid": True, "auditId": report["auditId"], "findings": len(ids), "checks": len(actual_checks), "jsonSha256": hashlib.sha256(path.read_bytes()).hexdigest(), "markdownSha256": hashlib.sha256(markdown.read_bytes()).hexdigest(), "evidenceStaged": False}
(EVIDENCE / "report-validation.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result))
