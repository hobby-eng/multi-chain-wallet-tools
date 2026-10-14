"""Validate this follow-up's public records against untouched local evidence."""

import ast
import hashlib
import json
import pathlib
import re
import sys
import subprocess

from jsonschema import Draft202012Validator
# Procedure files edited after this audit are checked through docs/audits/procedure_changes.py.
sys.dont_write_bytecode = True
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from procedure_changes import matches_audited  # noqa: E402
from append_remediation import public


class FollowupValidator:
    def __init__(self, report, historical=False):
        self.historical = historical
        self.report = report.resolve()
        self.root = self.report.parents[2]
        self.evidence = self.root / "docs/audits/AUD-027-evidence"

    def run(self):
        record = json.loads(self.report.read_text())
        markdown = self.report.with_suffix(".md").read_text()
        schema = json.loads((self.root / "docs/audit-report.schema.json").read_text())
        Draft202012Validator(schema).validate(record)
        assert record["auditId"] == "AUD-027" and record["auditNumber"] == 27
        assert record["date"] == record["completedAtUtc"][:10]
        assert self.report.stem == f"AUD-027-{record['date']}"
        assert record["completedAtUtc"].endswith("+00:00")
        assert record["snapshot"]["commit"] in markdown
        assert len(record["checks"]["coverage"]) == 32
        assert len({item["checkId"] for item in record["checks"]["coverage"]}) == 32
        assert len(record["duplicationRegister"]["families"]) == 34
        assert len({item["key"] for item in record["duplicationRegister"]["families"]}) == 34
        ids = [item["id"] for item in record["findings"]]
        assert len(ids) == len(set(ids))
        for identity in ids:
            assert f"#### {identity}" in markdown
        for item in record["remediation"]:
            assert item["id"] in markdown
        for item in record["procedure"]:
            assert matches_audited(self.root / item["path"], item["sha256"])
        for item in record["checks"]["commands"]:
            log = self.evidence / f"{item['name']}.log"
            assert hashlib.sha256(log.read_bytes()).hexdigest() == item["logSha256"]
            original = json.loads((self.evidence / f"{item['name']}.command.json").read_text())
            assert original["command"] == item["command"]
            assert original["exitCode"] == item["exitCode"]
            for suffix, field in [("before", "sourceBefore"), ("after", "sourceAfter")]:
                manifest = json.loads((self.evidence / f"{item['name']}.source-{suffix}.json").read_text())
                fingerprint = hashlib.sha256(
                    "".join(f"{f['sha256']}  {f['path']}\n" for f in manifest["files"]).encode()
                ).hexdigest()
                assert fingerprint == manifest["fingerprint"] == item[field]
        for path in self.root.glob("docs/audits/AUD-027-harnesses/*.py"):
            ast.parse(path.read_text())
        phase = record.get("authorizedRemediation")
        if phase is not None:
            self.remediation(record, phase, markdown)
        published = self.report.read_text() + markdown + (self.root / "docs/audits/AUD-027-harnesses/README.md").read_text()
        assert not re.search(r"/home/(?!user(?:/|$))[^/\s]+/", published)
        assert not re.search(r"[\u0400-\u04ff]", published)
        print(json.dumps({"schema": "passed", "pairedIds": len(ids), "coverage": 32,
                          "families": 34, "commandHashes": "passed", "privacy": "passed"}))

    def remediation(self, record, phase, markdown):
        original_json = self.evidence / "remediation-original-report.json"
        original_md = self.evidence / "remediation-original-report.md"
        assert hashlib.sha256(original_json.read_bytes()).hexdigest() == phase["originalReportSha256"]
        assert hashlib.sha256(original_md.read_bytes()).hexdigest() == phase["originalMarkdownSha256"]
        assert markdown.startswith(original_md.read_text())
        original = json.loads(original_json.read_text())
        # These historical conclusions are not silently replaced by a newer snapshot.
        for key in ["snapshot", "findings", "checks", "duplicationRegister", "sourceBindings"]:
            assert record[key] == original[key], key
        assert len(phase["families"]) == 34
        assert {item["key"] for item in phase["families"]} == {
            item["key"] for item in original["duplicationRegister"]["families"]
        }
        assert phase["completedAtUtc"].endswith("+00:00")
        source = json.loads((self.evidence / "remediation-source-final.json").read_text())
        fingerprint = hashlib.sha256(
            "".join(f"{item['sha256']}  {item['path']}\n" for item in source["files"]).encode()
        ).hexdigest()
        assert fingerprint == source["fingerprint"] == phase["sourceFingerprint"]
        retained = {item["path"]: item["sha256"] for item in source["files"]}
        for item in [*phase["changedSources"], *phase["documentationCorrections"]]:
            if self.historical:
                actual = retained.get(item["path"])
                if actual is None:
                    actual = hashlib.sha256((self.root / item["path"]).read_bytes()).hexdigest()
                assert actual == item["sha256"], item["path"]
            else:
                assert hashlib.sha256((self.root / item["path"]).read_bytes()).hexdigest() == item["sha256"], item["path"]
        if not self.historical:
            item = phase["workspaceInstruction"]
            assert hashlib.sha256((self.root / item["path"]).read_bytes()).hexdigest() == item["sha256"]
        for item in phase["families"]:
            actual = retained[item["owner"]] if self.historical else hashlib.sha256((self.root / item["owner"]).read_bytes()).hexdigest()
            assert actual == item["ownerSha256"]
            assert item["key"] in markdown
        for item in phase["artifacts"]:
            if self.historical:
                assert any(item["sha256"] in (self.evidence / f"{command['name']}.log").read_text()
                           for command in phase["commands"])
            else:
                assert hashlib.sha256((self.root / item["path"]).read_bytes()).hexdigest() == item["sha256"]
        for item in phase["commands"]:
            path = self.evidence / f"{item['name']}.command.json"
            original_command = json.loads(path.read_text())
            assert hashlib.sha256(path.read_bytes()).hexdigest() == item["recordSha256"]
            assert public(original_command["command"]) == item["command"]
            assert original_command["exitCode"] == item["exitCode"]
            assert hashlib.sha256((self.evidence / f"{item['name']}.log").read_bytes()).hexdigest() == item["logSha256"]
        for item in phase["dispositions"]:
            assert item["id"] in markdown and item in record["remediation"]
        assert not subprocess.check_output(
            ["git", "ls-files", "docs/audits/AUD-027-evidence/"], cwd=self.root
        ).strip()
        result = {"remediation": "passed", "sourceFingerprint": fingerprint,
                  "families": 34, "dispositions": len(phase["dispositions"]), "artifacts": 8,
                  "historicalRecords": "unchanged", "evidenceTracked": False,
                  "validationMode": "retained-evidence" if self.historical else "live-source"}
        (self.evidence / "remediation-report-validation.json").write_text(json.dumps(result, indent=2) + "\n")
        sums = [f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}"
                for path in sorted(self.evidence.iterdir())
                if path.is_file() and path.name not in {"SHA256SUMS", "remediation-SHA256SUMS"}]
        (self.evidence / "remediation-SHA256SUMS").write_text("\n".join(sums) + "\n")
        print(json.dumps(result))


if __name__ == "__main__":
    FollowupValidator(pathlib.Path(sys.argv[1]), historical="--historical" in sys.argv[2:]).run()
