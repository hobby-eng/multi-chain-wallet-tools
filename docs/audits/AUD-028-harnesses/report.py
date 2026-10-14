"""Generate the paired baseline reports from retained, immutable local evidence."""

import collections
import datetime
import hashlib
import json
import pathlib
import re
import shlex
import sys

from capture import AuditCapture


class AuditReportGenerator:
    """Own report identity, source bindings, privacy and Markdown/JSON agreement."""

    def __init__(self, root, dash):
        self._root = pathlib.Path(root).resolve()
        self._dash = pathlib.Path(dash).resolve()
        self._harness = pathlib.Path(__file__).resolve().parent
        self._evidence = self._root / "docs/audits/AUD-028-evidence"
        self._plan = self._load(self._evidence / "plan.json")
        self._notes = self._load(self._harness / "report-notes.json")
        self._home = str(pathlib.Path.home())

    @staticmethod
    def _load(path):
        return json.loads(path.read_text())

    @staticmethod
    def _hash(path):
        return AuditCapture.hash_file(path)

    def _redact(self, value):
        if isinstance(value, str):
            return value.replace(self._home, "/home/user")
        if isinstance(value, list):
            return [self._redact(item) for item in value]
        if isinstance(value, dict):
            return {self._redact(key): self._redact(item) for key, item in value.items()}
        return value

    def _commands(self, evidence):
        records = []
        for path in sorted(evidence.glob("*.command.json")):
            record = self._load(path)
            name = path.name.removesuffix(".command.json")
            record["name"] = name
            record["recordSha256"] = self._hash(path)
            record["log"] = f"{name}.log"
            if self._hash(evidence / record["log"]) != record["logSha256"]:
                raise RuntimeError(f"Original log hash changed: {name}")
            record["displayCommand"] = shlex.join(record["command"])
            records.append(record)
        return self._redact(records)

    def _findings(self, source):
        candidates = []
        for name in ["base-findings.json", "deriver-findings.json", "crypto-findings.json"]:
            candidates.extend(self._load(self._harness / name))
        candidates.append(self._notes["testQualityFinding"])
        levels = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        candidates.sort(key=lambda item: (levels[item["severity"]], item["category"], item["title"]))
        counters = collections.Counter()
        bindings = {item["path"]: item["sha256"] for item in source["files"]}
        for item in candidates:
            category = item["category"]
            counters[category] += 1
            item["id"] = f"AUD-028-{category}{counters[category]:03d}"
            item["kind"] = "finding"
            item["status"] = "open"
            item["sourceBindings"] = {}
            for location in item["affectedFiles"]:
                path = re.sub(r":\d+$", "", location)
                if path not in bindings:
                    raise RuntimeError(f"Unbound finding source: {path}")
                item["sourceBindings"][path] = bindings[path]
            item["evidenceBindings"] = {
                name: self._hash(self._evidence / name) for name in item["evidence"]
            }
        return self._redact(candidates)

    def _coverage(self):
        details = {item["checkId"]: item for item in self._load(self._harness / "coverage.json")}
        return [{**item, **details[item["checkId"]]} for item in self._plan["coveragePlan"]]

    def _record(self, root, number, snapshot_name):
        evidence = root / f"docs/audits/AUD-{number:03d}-evidence"
        source = self._load(evidence / f"{snapshot_name}.source.json")
        current = AuditCapture(root, number).source()
        if current != source:
            raise RuntimeError(f"Reviewed source changed in {root.name}; do not regenerate its baseline report.")
        identity = self._load(evidence / f"{snapshot_name}.identity.json")
        commands = self._commands(evidence)
        for record in commands:
            if record["sourceBefore"] != source["fingerprint"] or record["sourceAfter"] != source["fingerprint"]:
                raise RuntimeError(f"Command is not bound to the reviewed snapshot: {record['name']}")
        return {
            "schemaVersion": 1,
            "auditId": f"AUD-{number:03d}",
            "auditNumber": number,
            "date": "2026-10-12",
            "completedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
            "title": f"{root.name}: full scope, bounded baseline audit",
            "reviewer": {"name": "Codex coordinator and five reviewers", "model": None, "reasoningEffort": None},
            "snapshot": {
                "commit": identity["head"].strip(),
                "commitComplete": False,
                "workingTree": {
                    "state": "pre-existing dirty primary checkout; no production remediation",
                    "sourceFileCount": len(source["files"]),
                    "snapshotUtc": identity["capturedAtUtc"],
                    "diffSha256": self._hash(evidence / f"{snapshot_name}.diff"),
                    "sourceManifestSha256": self._hash(evidence / f"{snapshot_name}.source.json"),
                    "gitDirectory": identity["gitDirectory"].strip(),
                    "commonDirectory": identity["commonDirectory"].strip(),
                },
                "sourceFingerprint": source["fingerprint"],
                "sourceManifest": source["files"],
            },
            "procedure": self._plan["procedure"],
            "scope": self._plan["scope"] if number == 28 else "Dash distribution workflows, source selection, document pins and inherited upstream asset prerequisites",
            "checks": self._coverage(),
            "commands": commands,
            "findings": [],
            "observations": [],
            "remediation": [],
            "limitations": self._notes["limitations"],
            "assessment": "Baseline only. Full execution and release acceptance are incomplete. No fixes, commits, pushes, tags or releases were performed.",
        }

    def _multi(self):
        record = self._record(self._root, 28, "baseline")
        source = self._load(self._evidence / "baseline.source.json")
        record["findings"] = self._findings(source)
        record["summary"] = {
            "findings": len(record["findings"]),
            "bySeverity": dict(collections.Counter(item["severity"] for item in record["findings"])),
            "releaseBlockers": [item["id"] for item in record["findings"] if item["releaseBlocking"]],
            "ordinaryJavaScript": {"uniqueCases": 491, "passed": 490, "failed": 1},
            "launcherRust": {"uniqueCases": 8, "passedAfterScopedReruns": 8},
            "auditProbes": {"uniqueCases": 86, "passed": 29, "failed": 57},
            "probeCounting": "52 boundary/public/architecture cases +22 original Deriver cases +12 final crypto/Envelope cases. Revised Deriver subset11 and initial Envelope4 are overlapping follow-ups, not additional unique cases. Failed assertions cover shared roots, not57 findings.",
            "initializationErrors": "Original unsupported describe.sequential, advisory CLI flag and sandbox EPERM results are preserved; incomplete statistics timeout excluded.",
        }
        record["environment"] = self._load(self._evidence / "environment.json")
        record["integrations"] = self._load(self._evidence / "inventory.json")
        record["reviewerPhases"] = self._load(self._evidence / "reviewer-assignments.json")["agents"]
        record["skepticDecisions"] = self._notes["skepticDecisions"]
        record["architectureRecommendations"] = self._load(self._harness / "recommendations.json")
        record["remediation"] = [
            {"id": item["id"], "status": "open", "fixCommit": None, "verificationCommit": None, "evidence": item["evidence"]}
            for item in record["findings"]
        ] + [self._notes["historicalFollowup"]]
        artifacts = self._load(self._evidence / "current-artifact-snapshot.artifacts.json")
        # Default pages, except the failed Dash Deriver, and three actually built samples.
        record["reviewedArtifacts"] = [
            item for item in artifacts
            if item["path"].endswith(".html") and (
                item["path"].startswith("dist/audit-028/") or
                (re.match(r"dist/(multi-chain|dash-community)-edition/[^/]+/[^/]+\.html$", item["path"])
                 and "/release/" not in item["path"])
            )
        ]
        for artifact in record["reviewedArtifacts"]:
            artifact["sourceRelation"] = (
                "old; current source fingerprint verifier rejects"
                if "/dash-community-edition/key-derivation/" in artifact["path"]
                else "fresh build; static artifact check or representative composition only; no browser execution"
            )
        record["harnessHashes"] = {
            str(path.relative_to(self._root)): self._hash(path)
            for path in sorted(self._harness.iterdir()) if path.is_file()
        }
        record["dependencySourceBindings"] = {}
        cache = self._root.parent / "workingspace/cargo/registry/src"
        for pattern in [
            "*/bc-crypto-0.14.0/src/public_key_encryption.rs",
            "*/bc-components-0.31.1/src/x25519/x25519_public_key.rs",
            "*/bc-envelope-0.43.0/src/base/cbor.rs",
            "*/codex32-0.1.0/src/lib.rs",
            "*/codex32-0.1.0/src/field.rs",
        ]:
            for path in cache.glob(pattern):
                record["dependencySourceBindings"][str(path)] = self._hash(path)
        return self._redact(record)

    def _distribution(self, multi):
        record = self._record(self._dash, 1, "review-snapshot")
        original = self._load(self._dash / "docs/audits/AUD-001-evidence/baseline.source.json")
        record["snapshot"]["auditSetup"] = {
            "originalSourceFingerprint": original["fingerprint"],
            "change": "Only .gitignore gained local audit-evidence/Python-cache exclusions before the reviewed snapshot. Pre-existing release workflow edits were preserved.",
        }
        record["summary"] = {"ownedFindings": 0, "resolverCases": 13, "resolverPassed": 13,
                             "assessment": "No distribution-owned defect confirmed by these bounds. Current upstream blockers prevent acceptance of new assets."}
        record["upstreamAudit"] = {
            "repository": "multi-chain-wallet-tools",
            "auditId": "AUD-028",
            "commit": multi["snapshot"]["commit"],
            "sourceFingerprint": multi["snapshot"]["sourceFingerprint"],
            "releaseBlockers": multi["summary"]["releaseBlockers"],
            "report": "../../../multi-chain-wallet-tools/docs/audits/AUD-028-2026-10-12.md",
        }
        workflow_scopes = {
            "CHECK-SEC-001": "Distribution threat model: maintainers select an exact upstream release/tag/SHA; build and publication authority are separated.",
            "CHECK-SEC-003": "Review workflow credential permissions, third-party action pins, release downloads and first-party publication scripts. No private wallet material belongs in this repository.",
            "CHECK-SEC-007": "Review read-only build tokens, scoped publication authority, stable release queue and cancellation policy; bounded resolver fixtures.",
            "CHECK-API-001": "Exercise the actual workflow Bash/gh/jq input contract with13 bounded public release-list fixtures.",
            "CHECK-API-002": "Review concurrency/queued stable-release selection and explicit release overrides; no running CI jobs dispatched.",
            "CHECK-API-004": "Review upstream tag/SHA, expected asset naming/checksum admission and the exact five-document source manifest.",
        }
        for check in record["checks"]:
            category = check["checkId"].split("-")[1]
            check["owner"] = "coordinator"
            check["evidence"] = ["release-resolver.command.json", "git-whitespace.command.json"]
            if check["checkId"] in workflow_scopes:
                check["outcome"] = "partial"
                check["method"] = workflow_scopes[check["checkId"]]
                check["gap"] = "Static/fixture evidence only; no real release downloads, permission enforcement, signing or publication. Upstream assets retain AUD-028 acceptance gaps."
            elif category in {"SEC", "FUN", "API", "UI"}:
                check["outcome"] = "not-applicable"
                check["method"] = "No corresponding runtime implementation is owned by this distribution repository; trace inherited packaged HTML/launcher prerequisites to upstream AUD-028."
                check["gap"] = "Upstream implementation is covered with explicit execution gaps in AUD-028. No local browser/crypto/provider implementation exists to execute here."
            else:
                check["outcome"] = "partial"
                check["method"] = "Review actual workflow/document pins and repository boundaries; execute13 release-selection cases where applicable."
                check["gap"] = "No paid release workflow, artifact publication, package execution or canonical rebuild; upstream source/build acceptance unresolved."
        record["distributionEvidence"] = [
            "13 real workflow Bash resolver cases with fake gh JSON and real jq: stable/draft/prerelease/floor/already-published/manual choices pass.",
            "Release selection binds version/tag/source SHA and checks expected launcher/platform/checksum assets; build permissions are read-only, publication scoped separately. Static review, not CI execution.",
            "documentation-source.json binds five copied legal/release documents; actual SHA-256 values match. A historic documentation source pin is not a claim of synchronizing the current dirty upstream tree.",
            "Local bot commit evidence includes an SSH signature. No unsigned-commit finding is inferred from missing visible workflow signing setup; future CI execution remains unverified.",
        ]
        record["harnessHashes"] = {
            str(path.relative_to(self._dash)): self._hash(path)
            for path in sorted((self._dash / "docs/audits/AUD-001-harnesses").iterdir()) if path.is_file()
        }
        return self._redact(record)

    @staticmethod
    def _cell(value):
        return str(value).replace("|", "\\|").replace("\n", " ")

    def _markdown(self, record):
        lines = [f"# {record['auditId']} — {record['title']}", "", "## Record metadata", ""]
        snapshot = record["snapshot"]
        for text in [
            f"**Audit number:** {record['auditNumber']}.",
            f"**Completed (UTC):** {record['completedAtUtc']}.",
            "**Reviewer:** Codex coordinator and five reviewers; exact model and reasoning effort unknown.",
            f"**Reviewed commit:** `{snapshot['commit']}`; dirty source, not a complete commit snapshot.",
            f"**Source fingerprint:** `{snapshot['sourceFingerprint']}`; {snapshot['workingTree']['sourceFileCount']} Git-visible non-audit files.",
            f"**Retained diff SHA-256:** `{snapshot['workingTree']['diffSha256']}`.",
            "**Working tree:** Primary existing checkout; no worktree or source copy. No production remediation or commit.",
            "**Verification:** Full scope with bounded targeted/security checks; incomplete browser/release execution.",
        ]:
            lines.append(f"- {text}")
        lines += ["", "The JSON companion carries the complete source manifest, sanitized actual command records, reviewer phases where available, exact hashes and finding fields. Original evidence is ignored and machine-local.", "", "### Procedure bindings", "", "| Procedure | SHA-256 |", "| --- | --- |"]
        lines += [f"| `{path}` | `{digest}` |" for path, digest in record["procedure"].items()]
        lines += ["", "## Finding register", "", "| ID | Category | Severity | Status | Release blocking | Title |", "| --- | --- | --- | --- | --- | --- |"]
        for item in record["findings"]:
            lines.append(f"| {item['id']} | {item['category']} | {item['severity']} | open | {str(item['releaseBlocking']).lower()} | {self._cell(item['title'])} |")
        if not record["findings"]:
            lines.append("| None confirmed locally | — | — | — | Inherited upstream blockers | Distribution-only scope |")
        lines += ["", "## Review evidence", "", "### Scope and methodology", "", str(record["scope"]), ""]
        if record["auditNumber"] == 28:
            summary = record["summary"]
            lines += [f"Confirmed roots: **{summary['findings']}** ({', '.join(f'{count} {severity}' for severity, count in summary['bySeverity'].items())}). All remain open. Release blocking is separate from severity.", "", "491 unique ordinary JavaScript cases:490 passed, one stale positive fixture failed. Eight unique launcher Rust cases passed after scoped socket reruns. Audit probes:86 unique cases,29 passed and57 failed assertions across shared roots. The revised11-case Deriver subset and initial4-case Envelope run are overlapping follow-ups. Initialization errors and the incomplete statistics timeout are excluded from completed totals.", "", "Five reviewers covered Deriver, cryptography, security, combined connected tools/Inspector, and architecture/documentation. The coordinator executed serialized checks and challenged claims. Crypto test preparation encountered an automatic content filter; later ordinary synthetic conformance tests completed. No independent weak-recipient decryption was executed.", "", "Environment: Node26.10.0, pnpm12.8.1, Rust1.99.0, Vitest5.0.3, TypeScript7.0.2, Linux x86_64. One child group at a time,1536 MiB Node heap, one Cargo job,120-second default deadline and1200 MiB available-memory reserve. Host processes remain outside enforcement."]
        else:
            lines += record["distributionEvidence"] + ["", f"Audit-only setup: {snapshot['auditSetup']['change']}", "", f"Original source fingerprint: `{snapshot['auditSetup']['originalSourceFingerprint']}`. Reviewed fingerprint above binds the added ignore policy.", "", f"Inherited findings keep their upstream IDs: [AUD-028]({record['upstreamAudit']['report']}). They are not duplicated as local findings."]
        lines += ["", "### Coverage ledger", "", "| Check ID | Group | Owner | Method / scope | Outcome | Evidence / remaining gap |", "| --- | --- | --- | --- | --- | --- |"]
        for check in record["checks"]:
            lines.append("| " + " | ".join(self._cell(value) for value in [check["checkId"], check["title"], check["owner"], check["method"], check["outcome"], ", ".join(check["evidence"]) + "; " + check["gap"]]) + " |")
        lines += ["", "### Checks", "", "Names identify ignored local `.command.json` and `.log` records. The JSON companion carries the complete sanitized command, interval, source hashes and record hash. Exit codes are retained without weakening failing contracts.", "", "| Evidence name | Actual command | Exit / stop | Original log SHA-256 |", "| --- | --- | --- | --- |"]
        for command in record["commands"]:
            lines.append(f"| {command['name']} | `{self._cell(command['displayCommand'])}` | {command['exitCode']} / {command['stopped'] or 'completed'} | `{command['logSha256']}` |")
        if "reviewedArtifacts" in record:
            lines += ["", "### Artifact bindings", "", "Default Dash Deriver is explicitly stale. Other listed outputs are fresh local HTML builds; they are not runtime or release acceptance.", "", "| Artifact | Bytes | SHA-256 | Source relationship |", "| --- | --- | --- | --- |"]
            lines += [f"| `{item['path']}` | {item['bytes']} | `{item['sha256']}` | {item['sourceRelation']} |" for item in record["reviewedArtifacts"]]
        lines += ["", "### Findings", ""]
        for item in record["findings"]:
            lines += [f"#### {item['id']} — {item['severity'].title()} — {item['title']}", ""]
            labels = [
                ("Category", item["category"]), ("Severity", item["severity"]), ("Status", "open"),
                ("Release blocking", str(item["releaseBlocking"]).lower()),
                ("Affected files and builds", "; ".join(f"`{path}`" for path in item["affectedFiles"])),
                ("Reproduction", item["reproduction"]), ("Expected behavior", item["expected"]),
                ("Observed behavior", item["observed"]), ("Impact", item["impact"]),
                ("Evidence", ", ".join(item["evidence"])), ("Recommended fix", item["recommendedFix"]),
                ("Required verification", item["requiredVerification"]),
            ]
            lines += [f"- **{label}:** {value}" for label, value in labels]
            for reference in item.get("references", []):
                lines.append(f"- **Pinned/primary reference:** <{reference}>.")
            for limitation in item.get("limitations", []):
                lines.append(f"- **Qualification:** {limitation}")
            if "qualification" in item:
                lines.append(f"- **Qualification:** {item['qualification']}")
            lines += ["", "Source and evidence SHA-256 bindings are in this finding's JSON record.", ""]
        lines += ["### Remediation and follow-up", "", "| ID | Status | Fix commit | Verification commit | Evidence |", "| --- | --- | --- | --- | --- |"]
        lines += [f"| {item['id']} | {item['status']} | Not fixed | Not run | {self._cell(', '.join(item['evidence']))} |" for item in record["remediation"]]
        if record["auditNumber"] == 28:
            lines += ["", self._notes["historicalFollowup"]["explanation"]]
        lines += ["", "### Informational observations and recommendations", ""]
        for item in record.get("architectureRecommendations", []):
            lines += [f"- **{item['area']}:** {item['owner']} {item['reason']} Locations: " + ", ".join(f"`{path}`" for path in item["locations"])]
        if record["auditNumber"] == 28:
            lines += ["- The two confirmed semantic duplication families are derivation paths and CoinJoin identity mapping. Inspector network policy and local search scheduling are consolidation recommendations tied to existing runtime roots. Do not turn every occurrence into a separate finding.", "- Npm audit:zero advisories for150 packages. Offline Cargo:zero known vulnerabilities across five locks using1296 cached advisories; freshness unknown, yanked checks off. atomic-polyfill1.0.3 and paste1.0.15 unmaintained warnings are retained as informational.", "- MHFE0.6.0 signed package remains pinned; both Argon2 engines and Envelope's own Argon2 remain. MnemoCode169-file source manifest is byte-matched but intentionally unreleased/dirty, so CI rejection is a release prerequisite, not a new defect.", "", "Skeptic decisions:"]
            lines += [f"- {item}" for item in record["skepticDecisions"]]
        lines += ["", "### Assessment and limitations", "", record["assessment"], ""]
        lines += [f"- {item}" for item in record["limitations"]]
        return self._redact("\n".join(lines) + "\n")

    def run(self):
        for path, expected in self._plan["procedure"].items():
            if self._hash(self._root / path) != expected:
                raise RuntimeError(f"Audit procedure changed: {path}")
        multi = self._multi()
        distribution = self._distribution(multi)
        for root, record in [(self._root, multi), (self._dash, distribution)]:
            stem = f"AUD-{record['auditNumber']:03d}-{record['date']}"
            directory = root / "docs/audits"
            directory.mkdir(exist_ok=True)
            (directory / f"{stem}.json").write_text(json.dumps(record, indent=2) + "\n")
            (directory / f"{stem}.md").write_text(self._markdown(record))
        print(json.dumps({"findings": multi["summary"], "dash": distribution["summary"]}, indent=2))


if __name__ == "__main__":
    checkout = pathlib.Path(__file__).resolve().parents[3]
    AuditReportGenerator(
        sys.argv[1] if len(sys.argv) > 1 else checkout,
        sys.argv[2] if len(sys.argv) > 2 else checkout.parent / "dash-wallet-tools",
    ).run()
