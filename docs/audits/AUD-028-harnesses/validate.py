"""Validate paired reports and bind their conclusions to unchanged source/evidence."""

import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys

import jsonschema

from capture import AuditCapture

# The shared helpers of docs/audits: procedure files across later edits, and the retained
# evidence that the historical mode compares with instead of the live tree.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from procedure_changes import matches_audited
from retained_evidence import (manifest_hash, report_paths, retained_artifact,
                               retained_evidence_intact, retained_source)


class AuditReportValidator:
    """Own canonical shape, agreement, privacy and local evidence integrity checks."""

    def __init__(self, root, historical=False):
        # Historical: compare with the record's retained snapshot and evidence, not the live tree.
        self._historical = historical
        self._root = pathlib.Path(root).resolve()
        self._schema = self._load(self._root / "docs/audit-report.schema.json")
        self._home = str(pathlib.Path.home())
        self._expected_checks = set(re.findall(
            r"CHECK-(?:SEC|FUN|API|BLD|UI|ARC|DOC)-\d{3}",
            (self._root / "docs/FULL_AUDIT_GUIDE.md").read_text(),
        ))
        if len(self._expected_checks) != 32:
            raise RuntimeError("Canonical procedure must contain32 distinct checks.")

    @staticmethod
    def _unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise RuntimeError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    def _load(self, path):
        return json.loads(path.read_text(), object_pairs_hook=self._unique)

    @staticmethod
    def _require(condition, message):
        if not condition:
            raise RuntimeError(message)

    def _validate(self, root, number):
        directory = root / "docs/audits"
        json_path, markdown_path = report_paths(directory, number)
        stem = json_path.stem
        report = self._load(json_path)
        markdown = markdown_path.read_text()
        jsonschema.Draft202012Validator(self._schema).validate(report)
        self._require(report["auditNumber"] == number, "Audit number mismatch")
        self._require(report["auditId"] == f"AUD-{number:03d}", "Audit ID mismatch")
        checks = [item["checkId"] for item in report["checks"]]
        self._require(len(checks) == 32 and set(checks) == self._expected_checks,
                      "Coverage ledger mismatch")
        for check in report["checks"]:
            self._require(check["checkId"] in markdown and check["gap"] and check["method"],
                          "Missing Markdown check or explicit scope/gap")
        ids = [item["id"] for item in report["findings"] + report["observations"]]
        self._require(len(ids) == len(set(ids)), "Duplicate finding ID")
        headings = re.findall(r"^#### (AUD-\d{3,}-[A-Z]{2,3}\d{3,}) —", markdown, re.M)
        self._require(headings == ids, "Markdown/JSON finding register mismatch")
        evidence = directory / f"AUD-{number:03d}-evidence"
        source = retained_source(report) if self._historical else AuditCapture(root, number).source()
        self._require(source["fingerprint"] == report["snapshot"]["sourceFingerprint"],
                      "Reviewed source changed")
        self._require(source["files"] == report["snapshot"]["sourceManifest"],
                      "Source manifest mismatch")
        for relative, expected in report["procedure"].items():
            self._require(matches_audited(self._root / relative, expected),
                          "Procedure hash mismatch")
        for item in report["findings"]:
            self._require(item["id"].startswith(f"AUD-{number:03d}-{item['category']}"),
                          "Finding category/ID mismatch")
            for relative, expected in item["sourceBindings"].items():
                actual = (manifest_hash(source, relative) if self._historical
                          else AuditCapture.hash_file(root / relative))
                self._require(actual == expected, f"Finding source changed: {relative}")
            for relative, expected in item["evidenceBindings"].items():
                self._require(AuditCapture.hash_file(evidence / relative) == expected,
                              f"Finding evidence changed: {relative}")
            for field in ["title", "reproduction", "expected", "observed", "impact",
                          "recommendedFix", "requiredVerification"]:
                self._require(item[field] in markdown, f"Markdown field mismatch: {item['id']}/{field}")
        for command in report["commands"]:
            self._require(AuditCapture.hash_file(evidence / command["log"]) == command["logSha256"],
                          "Original command log changed")
            self._require(AuditCapture.hash_file(evidence / f"{command['name']}.command.json") == command["recordSha256"],
                          "Original command record changed")
            self._require(command["sourceBefore"] == source["fingerprint"] == command["sourceAfter"],
                          "Command/source snapshot mismatch")
        for relative, expected in report["harnessHashes"].items():
            self._require(AuditCapture.hash_file(root / relative) == expected,
                          f"Harness changed after report generation: {relative}")
        for artifact in report.get("reviewedArtifacts", []):
            if self._historical:
                self._require(retained_artifact(evidence, artifact), "Reported artifact not retained")
            else:
                self._require(AuditCapture.hash_file(root / artifact["path"]) == artifact["sha256"],
                              "Reported artifact changed")
        for path in [json_path, markdown_path, directory / "README.md"]:
            self._require(self._home not in path.read_text(), "Machine owner's home path leaked")
        harness_readme = directory / f"AUD-{number:03d}-harnesses/README.md"
        self._require(self._home not in harness_readme.read_text(), "Harness README leaks home path")
        staged = subprocess.check_output(["git", "diff", "--cached", "--name-only"], cwd=root).decode()
        self._require(f"docs/audits/AUD-{number:03d}-evidence/" not in staged,
                      "Local evidence is staged")
        for path in evidence.rglob("*"):
            if path.is_file():
                relative = str(path.relative_to(root))
                ignored = subprocess.run(["git", "check-ignore", "-q", "--", relative], cwd=root)
                self._require(ignored.returncode == 0, f"Local evidence is not ignored: {relative}")
        self._require(f"{stem}.md" in (directory / "README.md").read_text(), "Report is not indexed")
        if self._historical:
            retained = retained_evidence_intact(evidence)
            print(json.dumps({"auditId": report["auditId"], "outcome": "passed",
                              "validationMode": "retained-evidence",
                              "validatedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
                              "reportJsonSha256": AuditCapture.hash_file(json_path),
                              "reportMarkdownSha256": AuditCapture.hash_file(markdown_path),
                              "sourceFingerprint": source["fingerprint"],
                              "retainedEvidenceFiles": retained,
                              "notCompared": "the live source tree and dist/; no evidence file written"}))
            return report
        manifest = "".join(
            f"{AuditCapture.hash_file(path)}  {path.relative_to(evidence)}\n"
            for path in sorted(evidence.rglob("*"))
            if path.is_file() and path.name not in {"SHA256SUMS", "report-validation.json"}
        )
        (evidence / "SHA256SUMS").write_text(manifest)
        validation = {
            "validatedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
            "outcome": "passed",
            "auditId": report["auditId"],
            "command": "python3 docs/audits/AUD-028-harnesses/validate.py (from the existing multi-chain checkout)",
            "reportJsonSha256": AuditCapture.hash_file(json_path),
            "reportMarkdownSha256": AuditCapture.hash_file(markdown_path),
            "evidenceManifestSha256": hashlib.sha256(manifest.encode()).hexdigest(),
            "sourceFingerprint": source["fingerprint"],
            "findings": len(report["findings"]),
            "coverageChecks": len(checks),
            "commands": len(report["commands"]),
            "evidenceFilesHashed": len(manifest.splitlines()),
            "checked": ["schema", "unique JSON keys/IDs", "Markdown field agreement", "32 CHECK IDs",
                        "source/procedure/harness/artifact/evidence hashes", "source stability",
                        "privacy", "indexed reports", "ignored/unstaged evidence"],
        }
        (evidence / "report-validation.json").write_text(json.dumps(validation, indent=2) + "\n")
        print(json.dumps(validation))
        return report

    def run(self):
        multi = self._validate(self._root, 28)
        dash = self._validate(self._root.parent / "dash-wallet-tools", 1)
        self._require(dash["upstreamAudit"]["sourceFingerprint"] == multi["snapshot"]["sourceFingerprint"],
                      "Paired source reference mismatch")
        self._require(dash["upstreamAudit"]["releaseBlockers"] == multi["summary"]["releaseBlockers"],
                      "Paired upstream blockers mismatch")


if __name__ == "__main__":
    AuditReportValidator(pathlib.Path(__file__).resolve().parents[3],
                         historical="--historical" in sys.argv[1:]).run()
