"""Validate the scoped record and retained hashes with the standard library only."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/AUD-033-evidence"


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def load(path):
    return json.loads(path.read_text(), object_pairs_hook=unique)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


SCHEMA = load(ROOT / "docs/audit-report.schema.json")


def validate(value, schema):
    """Apply the keywords used by this repository's small JSON-schema envelope."""
    if "$ref" in schema:
        target = SCHEMA
        for part in schema["$ref"].removeprefix("#/").split("/"):
            target = target[part]
        validate(value, target)
    for part in schema.get("allOf", []):
        validate(value, part)
    if "const" in schema:
        assert value == schema["const"], "const"
    if "enum" in schema:
        assert value in schema["enum"], "enum"
    if "type" in schema:
        types = schema["type"]
        if isinstance(types, str):
            types = [types]
        matches = {
            "object": isinstance(value, dict),
            "array": isinstance(value, list),
            "string": isinstance(value, str),
            "integer": isinstance(value, int) and not isinstance(value, bool),
            "boolean": isinstance(value, bool),
            "null": value is None,
        }
        assert any(matches[t] for t in types), "type"
    if isinstance(value, dict):
        assert all(k in value for k in schema.get("required", [])), "required"
        for key, child in schema.get("properties", {}).items():
            if key in value:
                validate(value[key], child)
    if isinstance(value, list) and "items" in schema:
        for item in value:
            validate(item, schema["items"])
    if isinstance(value, str):
        if "pattern" in schema:
            assert re.search(schema["pattern"], value), "pattern"
        assert len(value) >= schema.get("minLength", 0), "minLength"
    if isinstance(value, (int, float)) and "minimum" in schema:
        assert value >= schema["minimum"], "minimum"


record_path = ROOT / "docs/audits/AUD-033-2026-10-15.json"
markdown_path = record_path.with_suffix(".md")
record = load(record_path)
markdown = markdown_path.read_text()
validate(record, SCHEMA)
controls = 0
for change in [lambda x: x.pop("scope"),
               lambda x: x.update(auditId="wrong"),
               lambda x: x["findings"][0].update(status="passed")]:
    candidate = json.loads(json.dumps(record))
    change(candidate)
    try:
        validate(candidate, SCHEMA)
    except AssertionError:
        controls += 1
    else:
        raise AssertionError("Invalid schema control accepted")
try:
    json.loads('{"same": 1, "same": 2}', object_pairs_hook=unique)
except ValueError:
    controls += 1
else:
    raise AssertionError("Duplicate JSON key accepted")
ids = [item["id"] for item in record["findings"]]
assert len(ids) == len(set(ids)) == 8
assert set(ids) == set(re.findall(r"^#### (AUD-033-\w+)", markdown, re.M))
assert set(ids) == {item["id"] for item in record["remediation"]}
assert "sergio" not in (markdown + record_path.read_text()).lower()
for link in re.findall(r"\]\(([^)]+)\)", markdown):
    assert (markdown_path.parent / link.split("#")[0]).exists(), link
procedure = (ROOT / "docs/FULL_AUDIT_GUIDE.md").read_text()
expected = set(re.findall(r"^### (CHECK-[A-Z]+-\d+)", procedure, re.M))
covered = {row[0] for row in record["scope"]["coverage"]}
excluded = {row["checkId"] for row in record["scope"]["outsideScopeChecks"]}
assert covered.isdisjoint(excluded) and covered | excluded == expected
for path, digest in record["procedureHashes"].items():
    assert sha(ROOT / path) == digest, path
for path, digest in record["guideHashes"].items():
    assert sha(ROOT.parent / ".github/instructions" / path) == digest, path
snapshot = load(OUT / "snapshot.json")
for item in snapshot["files"]:
    assert sha(ROOT / item["path"]) == item["sha256"], item["path"]
for name in ["inventory", "fast-gates", "action-pins"]:
    command = load(OUT / (name + ".command.json"))
    assert sha(OUT / (name + ".log")) == command["logSHA256"], name
result = {
    "schema": "passed against all validation keywords used by the envelope",
    "negativeControlsRefused": controls,
    "pairedFindings": len(ids),
    "procedureChecksAccountedFor": len(expected),
    "sourceFilesUnchanged": len(snapshot["files"]),
    "commandLogHashes": "passed",
    "privacyAndLinks": "passed",
    "reportSHA256": sha(markdown_path),
    "recordSHA256": sha(record_path),
}
(OUT / "report-validation.json").write_text(json.dumps(result, indent=2) + "\n")
paths = sorted(p for p in OUT.rglob("*") if p.is_file() and p.name != "SHA256SUMS")
(OUT / "SHA256SUMS").write_text("".join(
    sha(path) + "  " + str(path.relative_to(OUT)) + "\n" for path in paths
))
print(json.dumps(result, indent=2))
