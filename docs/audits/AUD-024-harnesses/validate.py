"""Validate an audit pair, its semantic count, source sites and local command evidence."""

import hashlib
import json
import pathlib
import re
import sys

from jsonschema import Draft202012Validator

# Procedure files edited after this audit are checked through docs/audits/procedure_changes.py.
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from procedure_changes import matches_audited  # noqa: E402


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path):
    return json.loads(path.read_text(), object_pairs_hook=unique_object)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class AuditRecordValidator:
    """An audit record owns its ID, source binding and consistency checks."""

    def __init__(self, path):
        self.path = path.resolve()
        self.root = self.path.parents[2]
        self.record = read_json(self.path)
        self.audit_id = self.record["auditId"]
        self.evidence = self.path.parent / f"{self.audit_id}-evidence"
        self.markdown = self.path.with_suffix(".md").read_text()
        self.errors = []

    def require(self, condition, message):
        if not condition:
            self.errors.append(message)

    def validate(self):
        schema = read_json(self.root / "docs/audit-report.schema.json")
        self.errors.extend(error.message for error in Draft202012Validator(schema).iter_errors(self.record))
        snapshot = read_json(self.evidence / "snapshot.json")
        self.require(self.record["snapshot"]["commit"] == snapshot["commit"], "Commit differs from snapshot")
        self.require(self.record["snapshot"]["sourceFingerprint"] == snapshot["sourceFingerprint"], "Source fingerprint differs from snapshot")
        for value in [self.audit_id, self.record["date"], snapshot["commit"], snapshot["sourceFingerprint"]]:
            self.require(value in self.markdown, f"Markdown omits metadata: {value}")
        expected_checks = set(re.findall(r"^### (CHECK-[A-Z]+-[0-9]+)", (self.root / "docs/FULL_AUDIT_GUIDE.md").read_text(), re.MULTILINE))
        checks = self.record["checks"]["coverage"]
        self.require({item["checkId"] for item in checks} == expected_checks, "Coverage differs from procedure IDs")
        self.require(len(checks) == len(expected_checks), "Repeated coverage ID")
        for item in checks:
            self.require(item["checkId"] in self.markdown, f"Markdown omits check: {item['checkId']}")
        ids = [item["id"] for item in self.record["findings"] + self.record["observations"]]
        self.require(len(ids) == len(set(ids)), "Repeated finding/observation ID")
        for item in self.record["findings"] + self.record["observations"]:
            heading = f"{item['id']} — {item['severity'].capitalize()} — {item['title']}"
            self.require(heading in self.markdown, f"Markdown finding differs: {item['id']}")
        manifest = {item["path"]: item for item in read_json(self.evidence / "source-manifest.json")}
        seen_sites = set()
        register = self.record["duplicationRegister"]
        for family in register["families"]:
            self.require(bool(family["facets"]), f"Family has no repeated rule: {family['key']}")
            for facet in family["facets"]:
                sites = facet["sites"]
                self.require(len(sites) >= 2, f"Rule has fewer than two definitions: {family['key']}")
                self.require(len(sites) == facet["definitionCount"], f"Rule count differs: {family['key']}")
                for site in sites:
                    self.validate_site(site, manifest, seen_sites, family["key"], facet["rule"])
        distinct_locations = {
            (site["path"], site["line"])
            for family in register["families"]
            for facet in family["facets"]
            for site in facet["sites"]
        }
        self.require(register["summary"]["families"] == len(register["families"]), "Family total differs")
        self.require(register["summary"]["distinctDefinitionLocations"] == len(distinct_locations), "Distinct location total differs")
        for command in self.record["checks"]["commands"]:
            record_path = self.root / command["record"]
            actual = read_json(record_path)
            self.require(actual["command"] == command["command"], f"Command differs: {record_path.name}")
            self.require(actual["exitCode"] == command["exitCode"], f"Exit code differs: {record_path.name}")
            log_path = record_path.with_name(record_path.name.replace(".command.json", ".log"))
            self.require(actual["logSha256"] == sha256(log_path), f"Command log hash differs: {log_path.name}")
        for procedure in self.record["procedure"]:
            self.require(matches_audited(self.root / procedure["path"], procedure["sha256"]), f"Procedure changed: {procedure['path']}")
        self.require(not re.search(r"[\u0400-\u04ff]", self.markdown), "Report contains non-English Cyrillic text")
        return {
            "auditId": self.audit_id,
            "passed": not self.errors,
            "findings": len(self.record["findings"]),
            "coverageChecks": len(checks),
            "semanticFamilies": len(register["families"]),
            "distinctDefinitionLocations": len(distinct_locations),
            "errors": self.errors,
        }

    def validate_site(self, site, manifest, seen_sites, family, rule):
        source_path = pathlib.Path(site["path"])
        source_path = source_path if source_path.is_absolute() else self.root / source_path
        self.require(source_path.is_file(), f"Missing source: {site['path']}")
        if not source_path.is_file():
            return
        digest = sha256(source_path)
        self.require(digest == site["sha256"], f"Source hash changed: {site['path']}")
        if site["path"] in manifest:
            self.require(digest == manifest[site["path"]]["sha256"], f"Source differs from baseline: {site['path']}")
        self.require(1 <= site["line"] <= len(source_path.read_text().splitlines()), f"Invalid source line: {site}")
        signature = (family, rule, site["path"], site["line"])
        self.require(signature not in seen_sites, f"Repeated definition site: {signature}")
        seen_sites.add(signature)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: validate.py <audit-report.json>")
    result = AuditRecordValidator(pathlib.Path(sys.argv[1])).validate()
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result["passed"] else 1)
