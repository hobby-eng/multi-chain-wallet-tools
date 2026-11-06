"""Validate audit publication structure, exact evidence bindings and declared limitations."""
import ast
import hashlib
import json
import pathlib
import re

from records import load, validate

ROOT = pathlib.Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/AUD-034-evidence"
REPORT = ROOT / "docs/audits/AUD-034-2026-10-15"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    report = load(REPORT.with_suffix(".json"))
    markdown = REPORT.with_suffix(".md").read_text()
    validate(report, load(ROOT / "docs/audit-report.schema.json"))
    expected = {row["id"]: (row["severity"].capitalize(), row["title"]) for row in report["findings"]}
    headings = re.findall(r"^#### (AUD-\d+-[A-Z]+\d+) — (\w+) — (.+)$", markdown, re.M)
    assert len(headings) == len(expected), "Missing or duplicate finding heading"
    assert {key: (severity, title) for key, severity, title in headings} == expected, "MD/JSON title/severity mismatch"
    assert len(expected) == len(report["findings"]), "Duplicate finding ID"
    assert len({row["id"] for row in report["remediation"]}) == len(expected), "Remediation ID mismatch"
    assert {row["id"] for row in report["remediation"]} == set(expected)
    for row in report["findings"]:
        assert row["id"].split("-")[2].startswith(row["category"]), "Category/ID mismatch"
        assert row["status"] == "open" and row["baselineOnly"]
        assert row["locations"], f"Missing affected location:{row['id']}"
        assert row["independentChallenge"], f"Missing independent challenge:{row['id']}"
    checks = re.findall(r"^### (CHECK-[A-Z]+-\d+) —", (ROOT / "docs/FULL_AUDIT_GUIDE.md").read_text(), re.M)
    assert len(checks) == 32 and [row["id"] for row in report["checks"]] == checks
    for finding in report["findings"]:
        assert finding["checks"], f"Finding lacks CHECK binding:{finding['id']}"
        assert len(finding["checks"]) == len(set(finding["checks"]))
        assert set(finding["checks"]) <= set(checks)
    for check in report["checks"]:
        reverse = {row["id"] for row in report["findings"] if check["id"] in row["checks"]}
        assert reverse == set(check["confirmedFindingIds"]), f"Forward/reverse CHECK mismatch:{check['id']}"
    assert len(report["newSkills"]) == 33 and len({row["name"] for row in report["newSkills"]}) == 33
    assert not any("pending" in row["status"] for row in report["newSkills"])
    assert len(report["coverage"]["fullFileInventory"]) == 1667
    assert len({row["path"] for row in report["coverage"]["fullFileInventory"]}) == 1667
    assert report["coverage"]["perFileMethodsPublished"] == 1667
    assert all(row["reviewMethod"] for row in report["coverage"]["fullFileInventory"])
    assert all("operationsOrGuarantees" in row and "reviewLimitations" in row for row in report["coverage"]["fullFileInventory"])
    assert len(report["coverage"]["coordinatorFileMethods"]) == 395
    assert not any("pending" in row["method"] for row in report["coverage"]["coordinatorFileMethods"])
    for binding in report["reviewBindings"]:
        assert sha(ROOT / binding["path"]) == binding["sha256"], f"Review binding drift:{binding['path']}"
    for command in report["executionEvidence"]:
        assert sha(ROOT / command["log"]) == command["logSha256"], f"Log drift:{command['label']}"
        command_path = OUT / f"{command['label']}.command.json"
        assert sha(command_path) == command["recordSha256"], f"Command drift:{command['label']}"
    identity = load(OUT / "final-source-identity.json")
    assert identity["sourceMatches"] and not identity["changedCurrentSourceFiles"]
    assert not identity["missing"] and not identity["addedOutsideAudit34"]
    assert all(row["matches"] for row in identity["procedures"])
    assert all(row["path"] == "docs/audits/README.md" for row in identity["changedBaselineFiles"])
    historical_records = []
    for record_path in sorted((ROOT / "docs/audits").glob("AUD-[0-9]*-20*.json")):
        record = load(record_path)
        validate(record, load(ROOT / "docs/audit-report.schema.json"))
        paired_text = record_path.with_suffix(".md").read_text()
        record_ids = [row["id"] for row in record["findings"]]
        assert len(record_ids) == len(set(record_ids))
        assert all(identifier in paired_text for identifier in record_ids)
        historical_records.append({"path": str(record_path.relative_to(ROOT)), "sha256": sha(record_path)})
    body = REPORT.with_suffix(".json").read_text() + markdown
    assert not re.search(r"/home/(?!user(?:/|\b))[^/\s]+", body), "Owner home path in publication"
    assert not re.search(r"[А-Яа-яЁё]", body), "Non-English report prose"
    assert "Europe/Moscow" not in body and "GMT+3" not in body, "Local timezone in publication"
    for source in pathlib.Path(__file__).parent.glob("*.py"):
        ast.parse(source.read_text())
    local_links = re.findall(r"\]\(([^)]+)\)", markdown)
    for link in local_links:
        if not re.match(r"[a-z]+:", link):
            assert (REPORT.parent / link.split("#")[0]).exists(), f"Missing relative link:{link}"
    summary = {
        "auditId": report["auditId"], "schemaSubset": "passed", "pairedMetadataIds": "passed",
        "sourceAndProcedureIdentity": "passed", "reviewAndCommandBindings": "passed",
        "publicationPrivacy": "passed", "localLinks": "passed", "findings": len(expected),
        "newFindings": sum(key.startswith("AUD-034-") for key in expected),
        "skills": 33, "checks": 32,
        "numberedRecordsStructurallyValidated": len(historical_records),
        "reportSha256": sha(REPORT.with_suffix(".json")), "markdownSha256": sha(REPORT.with_suffix(".md")),
        "limitation": "Publication validation only, not product/release acceptance or a claim that every defect was found.",
    }
    (OUT / "final-record-structure-validation.json").write_text(json.dumps(historical_records, indent=2) + "\n")
    (OUT / "publication-validation.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
