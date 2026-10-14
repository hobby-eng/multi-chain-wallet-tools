"""Validate current follow-up records while preserving the historical baseline."""

import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import sys

import jsonschema

# Resolve this follow-up's generator before exposing the historical harness directory.
from report import RemediationReport

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "AUD-028-harnesses"))
from capture import AuditCapture

# The shared helpers of docs/audits: procedure files across later edits, and the retained
# evidence that the historical mode compares with instead of the live tree.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from procedure_changes import matches_audited
from retained_evidence import (manifest_hash, report_paths, retained_artifact,
                               retained_evidence_intact, retained_source)


class FollowupValidator:
    """Check canonical shape, stable source/evidence bindings, privacy and retained IDs."""

    def __init__(self, root, historical=False):
        # Historical: compare with the record's retained snapshot and evidence, not the live tree.
        self._historical = historical
        self._root = root
        self._schema = self._load(root / "docs/audit-report.schema.json")
        self._checks = set(re.findall(r"CHECK-(?:SEC|FUN|API|BLD|UI|ARC|DOC)-\d{3}",
                                     (root / "docs/FULL_AUDIT_GUIDE.md").read_text()))

    @staticmethod
    def _unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise RuntimeError(f"Duplicate JSON key: {key}")
            value[key] = item
        return value

    def _load(self, path):
        return json.loads(path.read_text(), object_pairs_hook=self._unique)

    @staticmethod
    def _require(condition, description):
        if not condition:
            raise RuntimeError(description)

    def _validate(self, repository, number):
        directory = repository / "docs/audits"
        report_path, markdown_path = report_paths(directory, number)
        stem = report_path.stem
        report = self._load(report_path)
        markdown = markdown_path.read_text()
        jsonschema.Draft202012Validator(self._schema).validate(report)
        self._require(report["auditId"] == f"AUD-{number:03d}", "Incorrect report identity")
        checks = [item["checkId"] for item in report["checks"]]
        self._require(len(checks) == 32 and set(checks) == self._checks, "Incomplete procedure ledger")
        source = (retained_source(report) if self._historical
                  else AuditCapture(repository, number).source())
        self._require(source["fingerprint"] == report["snapshot"]["sourceFingerprint"], "Source changed")
        self._require(source["files"] == report["snapshot"]["sourceManifest"], "Source manifest changed")
        for path, expected in report["procedure"].items():
            self._require(matches_audited(self._root / path, expected), "Procedure changed")
        identifiers = [item["id"] for item in report["remediation"]]
        self._require(len(identifiers) == len(set(identifiers)), "Duplicate disposition ID")
        for row in report["remediation"]:
            self._require(row["id"] in markdown and row["summary"] in markdown, "Paired disposition mismatch")
            for path, expected in row["sourceBindings"].items():
                actual = (manifest_hash(source, path) if self._historical
                          else AuditCapture.hash_file(repository / path))
                self._require(actual == expected, f"Fix source changed: {path}")
        for item in report["checks"]:
            self._require(item["checkId"] in markdown and item["gap"], "Missing check or explicit gap")
        evidence = directory / f"AUD-{number:03d}-evidence"
        for command in report["commands"]:
            self._require(AuditCapture.hash_file(evidence / command["log"]) == command["logSha256"], "Log changed")
            self._require(AuditCapture.hash_file(evidence / f"{command['name']}.command.json") == command["recordSha256"], "Command record changed")
        commands = {item["name"]: item for item in report["commands"]}
        for name, counts in report.get("testCounts", {}).items():
            log = (evidence / commands[name]["log"]).read_text()
            if name == "native-final":
                self._require("4 passed; 0 failed" in log and "2 passed; 0 failed" in log,
                              "Native count mismatch")
            elif name == "release-resolver-final":
                self._require("Passed 13 actual workflow resolver cases" in log, "Resolver count mismatch")
            else:
                self._require(re.search(rf"\bTests\s+{counts['passed']} passed", log) is not None,
                              "JavaScript test count mismatch")
                self._require(re.search(rf"Test Files\s+{counts['files']} passed", log) is not None,
                              "JavaScript file count mismatch")
                if counts["skipped"]:
                    self._require(f"{counts['skipped']} skipped" in log, "Skipped count mismatch")
        for attempt in report.get("priorAttempts", []):
            relative = attempt["record"].removeprefix("local ")
            self._require(AuditCapture.hash_file(directory / relative) == attempt["recordSha256"],
                          "Prior attempt record changed")
        for row in report["remediation"]:
            for reference in row["evidence"]:
                name = pathlib.Path(reference).name.removesuffix(".command.json")
                command = commands[name]
                self._require(command["exitCode"] == 0 and command["stopped"] is None,
                              "Required verification failed")
                self._require(command["sourceAfter"] == source["fingerprint"], "Stale accepted verification")
                self._require(command["sourceBefore"] == command["sourceAfter"] or name == "canonical-wasm-final",
                              "Source changed during accepted verification")
        for path, expected in report["harnesses"].items():
            self._require(AuditCapture.hash_file(repository / path) == expected, "Harness changed")
        for artifact in report.get("artifacts", []):
            if self._historical:
                self._require(retained_artifact(evidence, artifact), "Artifact not retained")
                continue
            path = repository / artifact["path"]
            self._require(AuditCapture.hash_file(path) == artifact["sha256"] and path.stat().st_size == artifact["bytes"],
                          "Artifact changed")
        self._require(report["baselineReports"] == RemediationReport.BASELINES[repository.name], "Baseline anchor changed")
        for name, expected in report["baselineReports"].items():
            self._require(AuditCapture.hash_file(directory / name) == expected, "Historical baseline changed")
        for path in [report_path, markdown_path, directory / "README.md"]:
            self._require(re.search(r"/home/(?!user(?:/|\s|$))[^/\s]+", path.read_text()) is None,
                          "Published machine-owner path")
        readme = directory / f"AUD-{number:03d}-harnesses/README.md"
        self._require(readme.is_file(), "Missing harness instructions")
        self._require(re.search(r"/home/(?!user(?:/|\s|$))[^/\s]+", readme.read_text()) is None,
                      "Published harness machine-owner path")
        self._require(stem in (directory / "README.md").read_text(), "Report is not indexed")
        staged = subprocess.check_output(["git", "diff", "--cached", "--name-only"], cwd=repository).decode()
        self._require(f"AUD-{number:03d}-evidence" not in staged, "Evidence staged")
        for path in evidence.rglob("*"):
            if path.is_file():
                ignored = subprocess.run(["git", "check-ignore", "-q", "--", str(path.relative_to(repository))], cwd=repository)
                self._require(ignored.returncode == 0, "Evidence is not ignored")
        if self._historical:
            validation = {"auditId": report["auditId"], "outcome": "passed",
                          "validationMode": "retained-evidence",
                          "validatedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
                          "sourceFingerprint": source["fingerprint"],
                          "reportJsonSha256": AuditCapture.hash_file(report_path),
                          "reportMarkdownSha256": AuditCapture.hash_file(markdown_path),
                          "retainedEvidenceFiles": retained_evidence_intact(evidence),
                          "notCompared": "the live source tree and dist/; no evidence file written"}
            print(json.dumps(validation))
            return report
        manifest = "".join(f"{AuditCapture.hash_file(path)}  {path.relative_to(evidence)}\n"
                           for path in sorted(evidence.rglob("*"))
                           if path.is_file() and path.name not in {"SHA256SUMS", "report-validation.json"})
        (evidence / "SHA256SUMS").write_text(manifest)
        validation = {"auditId": report["auditId"], "outcome": "passed",
                      "validatedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
                      "sourceFingerprint": source["fingerprint"],
                      "reportJsonSha256": AuditCapture.hash_file(report_path),
                      "reportMarkdownSha256": AuditCapture.hash_file(markdown_path),
                      "evidenceManifestSha256": hashlib.sha256(manifest.encode()).hexdigest(),
                      "coverageChecks": len(checks), "dispositions": len(identifiers)}
        (evidence / "report-validation.json").write_text(json.dumps(validation, indent=2) + "\n")
        print(json.dumps(validation))
        return report

    def run(self):
        multi = self._validate(self._root, 29)
        original = self._load(self._root / "docs/audits/AUD-028-2026-10-12.json")
        expected = {item["id"] for item in original["findings"]} | {"AUD-026-DOC001"}
        self._require({item["id"] for item in multi["remediation"]} == expected, "Missing original disposition")
        for name, digest in multi["baselineReports"].items():
            self._require(AuditCapture.hash_file(self._root / "docs/audits" / name) == digest, "Historical baseline changed")
        dash = self._validate(self._root.parent / "dash-wallet-tools", 2)
        self._require(dash["upstreamAudit"]["sourceFingerprint"] == multi["snapshot"]["sourceFingerprint"], "Upstream binding mismatch")


if __name__ == "__main__":
    FollowupValidator(pathlib.Path(__file__).resolve().parents[3],
                      historical="--historical" in sys.argv[1:]).run()
