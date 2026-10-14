"""Check current fixes and assets against append-only historical and local evidence."""

import ast
import hashlib
import json
import pathlib
import re
import subprocess
import sys

from jsonschema import Draft202012Validator

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "AUD-027-harnesses"))
from append_remediation import digest, public
from capture import ReviewCommand


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"Duplicate JSON key: {key}")
        result[key] = value
    return result


class RemediationValidator:
    def __init__(self):
        self.recorder = ReviewCommand("remediation-validation", [], audit_number=26)
        self.root = self.recorder.root
        self.evidence = self.recorder.evidence
        self.report = self.root / "docs/audits/AUD-026-2026-10-09.json"
        self.markdown = self.report.with_suffix(".md")

    def read(self, path):
        return json.loads(path.read_text(), object_pairs_hook=unique_pairs)

    def run(self):
        report = self.read(self.report)
        Draft202012Validator(self.read(self.root / "docs/audit-report.schema.json")).validate(report)
        phase = report["authorizedRemediation"]
        original_json = self.evidence / phase["reportBaseline"]["json"]
        original_md = self.evidence / phase["reportBaseline"]["markdown"]
        original = self.read(original_json)
        assert digest(original_json) == phase["originalReportSha256"]
        assert digest(original_md) == phase["originalMarkdownSha256"]
        assert self.markdown.read_bytes().startswith(original_md.read_bytes())
        rebinding = phase["historicalMetadataRebinding"]
        if rebinding:
            earliest_json = self.evidence / "remediation-original-report.json"
            earliest_md = self.evidence / "remediation-original-report.md"
            assert digest(earliest_json) == rebinding["earliestReportSha256"]
            assert digest(earliest_md) == rebinding["earliestMarkdownSha256"]
            earliest = self.read(earliest_json)
            finding = next(item for item in earliest["findings"] if item["id"] == rebinding["findingId"])
            assert finding[rebinding["field"]] == rebinding["before"]
            finding[rebinding["field"]] = rebinding["after"]
            assert earliest == original
            assert earliest_md.read_bytes().replace(
                f"mhfe commit {rebinding['oldReference']}".encode(),
                f"mhfe commit {rebinding['newReference']}".encode(),
            ) == original_md.read_bytes()
        for key in original.keys() - {"remediation"}:
            assert report[key] == original[key], f"Historical field changed: {key}"
        assert report["remediation"][:len(original["remediation"])] == original["remediation"]
        assert report["remediation"][len(original["remediation"]):] == phase["dispositions"]
        assert {item["id"] for item in phase["dispositions"]} == {
            item["id"] for item in original["findings"]
        }
        assert len(phase["dispositions"]) == 32
        assert phase["completedAtUtc"].endswith("+00:00")
        manifest = self.read(self.evidence / "remediation-source-final.json")
        fingerprint = hashlib.sha256(
            "".join(f"{item['sha256']}  {item['path']}\n" for item in manifest["files"]).encode()
        ).hexdigest()
        assert fingerprint == manifest["fingerprint"] == phase["sourceFingerprint"]
        assert self.recorder.source() == manifest, "Live source differs from recorded fixes"
        current = {item["path"]: item["sha256"] for item in manifest["files"]}
        baseline = self.read(self.evidence / "remediation-baseline.json")
        before = {item["path"]: item["sha256"] for item in baseline["files"]}
        assert baseline["sourceFingerprint"] == phase["baselineSourceFingerprint"]
        assert phase["changedSources"] == [
            item for item in manifest["files"] if before.get(item["path"]) != item["sha256"]
        ]
        assert phase["removedSources"] == sorted(before.keys() - current.keys())
        for name, expected in phase["procedure"].items():
            assert digest(self.root / name) == expected, name
        for name, expected in {**phase["harnessHashes"], **phase["sharedHarnessHashes"]}.items():
            assert digest(self.root / name) == expected, name
        commands = {item["name"]: item for item in phase["commands"]}
        for name in phase["acceptedCommands"]:
            assert commands[name]["exitCode"] == 0, name
        for name, command in commands.items():
            path = self.evidence / f"{name}.command.json"
            original_command = self.read(path)
            assert digest(path) == command["recordSha256"], name
            assert public(original_command["command"]) == command["command"], name
            assert original_command["exitCode"] == command["exitCode"], name
            assert digest(self.evidence / f"{name}.log") == command["logSha256"], name
            for suffix, field in [("before", "sourceBefore"), ("after", "sourceAfter")]:
                source = self.read(self.evidence / f"{name}.source-{suffix}.json")
                sha = hashlib.sha256(
                    "".join(f"{item['sha256']}  {item['path']}\n" for item in source["files"]).encode()
                ).hexdigest()
                assert sha == source["fingerprint"] == command[field], name
        markdown = self.markdown.read_text()
        for disposition in phase["dispositions"]:
            assert disposition["id"] in markdown
            assert digest(self.root / disposition["owner"]) == disposition["ownerSha256"]
            assert disposition["status"] == ("fixed" if disposition["verificationGaps"] else "verified")
            for name in disposition["acceptedCommands"]:
                assert commands[name]["exitCode"] == 0, name
        assert len(phase["artifacts"]) == 12
        for artifact in phase["artifacts"]:
            path = self.root / artifact["path"]
            assert digest(path) == artifact["sha256"]
            assert path.stat().st_size == artifact["bytes"]
            command = commands[artifact["command"]]
            assert command["exitCode"] == 0
            assert command["sourceBefore"] == command["sourceAfter"] == fingerprint
            assert artifact["sha256"] in (self.evidence / f"{command['name']}.log").read_text()
            subprocess.run(["git", "check-ignore", "--quiet", artifact["path"]], cwd=self.root, check=True)
        assert not subprocess.check_output(
            ["git", "ls-files", "docs/audits/AUD-026-evidence/"], cwd=self.root
        ).strip(), "Evidence is tracked"
        published = self.report.read_text() + markdown + (
            self.root / "docs/audits/AUD-026-harnesses/README.md"
        ).read_text()
        assert not re.search(r"/home/(?!user(?:/|$))[^/\s]+/", published)
        assert not re.search(r"[\u0400-\u04ff]", published)
        for path in self.root.glob("docs/audits/AUD-026-harnesses/*.py"):
            ast.parse(path.read_text())
        result = {"remediation": "passed", "sourceFingerprint": fingerprint,
                  "dispositions": 32, "artifacts": 12, "historicalRecords": "unchanged",
                  "privacy": "passed", "evidenceTracked": False}
        (self.evidence / "remediation-report-validation.json").write_text(
            json.dumps(result, indent=2) + "\n"
        )
        print(json.dumps(result))


if __name__ == "__main__":
    RemediationValidator().run()
