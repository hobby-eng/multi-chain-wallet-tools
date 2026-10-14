"""Verify saved corrections after a host hang without repeating their runtime checks."""

import ast
import collections
import hashlib
from importlib import import_module
import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
retained = import_module("validate-remediation")


class ResumptionVerification:
    """Own the saved-byte comparison; historical failures remain separate evidence."""

    def __init__(self):
        self._prior = retained.RemediationValidator()
        self._root = self._prior.root
        self._evidence = self._prior.evidence

    def _digest(self, path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def run(self):
        report = self._prior.read(self._prior.report)
        phase = report["authorizedRemediation"]
        resumed = report["resumptionVerification"]
        assert resumed["checkedAtUtc"].endswith("+00:00")
        baseline = self._evidence / resumed["reportBefore"]["json"]
        baseline_md = self._evidence / resumed["reportBefore"]["markdown"]
        assert self._digest(baseline) == resumed["reportBefore"]["jsonSha256"]
        assert self._digest(baseline_md) == resumed["reportBefore"]["markdownSha256"]
        # This continuation is append-only even though earlier reference edits were not.
        before_append = {
            key: value for key, value in report.items() if key != "resumptionVerification"
        }
        assert before_append == self._prior.read(baseline)
        assert self._prior.markdown.read_bytes().startswith(baseline_md.read_bytes())
        original = self._prior.read(self._evidence / phase["reportBaseline"]["json"])
        assert report["findings"] == original["findings"]
        assert report["remediation"] == original["remediation"] + phase["dispositions"]
        assert {row["id"] for row in phase["dispositions"]} == {
            row["id"] for row in original["findings"]
        }
        states = dict(collections.Counter(row["status"] for row in phase["dispositions"]))
        assert states == resumed["dispositionCounts"]
        for row in phase["dispositions"]:
            assert self._digest(self._root / row["owner"]) == row["ownerSha256"], row["id"]
            assert row["status"] == ("fixed" if row["verificationGaps"] else "verified")

        source = self._prior.read(self._evidence / resumed["sourceManifest"])
        assert self._prior.recorder.source() == source, "Source changed after resumption review"
        assert source["fingerprint"] == resumed["sourceFingerprint"]
        old = self._prior.read(self._evidence / "remediation-source-final.json")
        assert old["fingerprint"] == phase["sourceFingerprint"]
        before = {row["path"]: row["sha256"] for row in old["files"]}
        current = {row["path"]: row["sha256"] for row in source["files"]}
        changes = [
            {"path": name, "beforeSha256": before.get(name), "afterSha256": current.get(name)}
            for name in sorted(before.keys() | current.keys())
            if before.get(name) != current.get(name)
        ]
        expected_changes = [
            {key: row[key] for key in ("path", "beforeSha256", "afterSha256")}
            for row in resumed["supportingPathChanges"]
        ]
        assert changes == expected_changes

        # Reuse recorded results only after checking the actual command and log bytes.
        for row in phase["commands"] + resumed["commands"]:
            record = self._evidence / f"{row['name']}.command.json"
            assert self._digest(record) == row["recordSha256"], row["name"]
            log = self._evidence / f"{row['name']}.log"
            assert self._digest(log) == row["logSha256"], row["name"]
            command = self._prior.read(record)
            assert command["exitCode"] == row["exitCode"]
            assert retained.public(command["command"]) == row["command"]
        commands = {row["name"]: row for row in resumed["commands"]}
        for name in resumed["acceptedCommands"]:
            assert commands[name]["exitCode"] == 0, name
        for row in resumed["historicalValidationFailures"]:
            assert commands[row["command"]]["exitCode"] != 0
            log = self._evidence / f"{row['command']}.log"
            assert row["diagnostic"] in log.read_text()

        for row in phase["artifacts"]:
            path = self._root / row["path"]
            assert self._digest(path) == row["sha256"], row["path"]
            assert path.stat().st_size == row["bytes"]
            subprocess.run(
                ["git", "check-ignore", "--quiet", row["path"]], cwd=self._root, check=True
            )
        hashes = {
            **phase["procedure"], **phase["harnessHashes"],
            **phase["sharedHarnessHashes"], **resumed["harnessHashes"],
        }
        for name, expected in hashes.items():
            assert self._digest(self._root / name) == expected, name
        for name, expected in resumed["historicalReportHashes"].items():
            assert self._digest(self._root / name) == expected, name
        assert not subprocess.check_output(
            ["git", "ls-files", "docs/audits/AUD-026-evidence/"], cwd=self._root
        ).strip()
        ast.parse(pathlib.Path(__file__).read_text())
        result = {
            "savedCorrections": "passed",
            "sourceFingerprint": source["fingerprint"],
            "dispositions": states,
            "artifacts": len(phase["artifacts"]),
            "historicalExactMatch": "failed-after-record-edits",
            "runtimeChecksRepeated": False,
        }
        print(json.dumps(result))


if __name__ == "__main__":
    ResumptionVerification().run()
