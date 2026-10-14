"""Generate a remediation follow-up without rewriting baseline evidence."""

import datetime
import hashlib
import json
import pathlib
import re
import shlex
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "AUD-028-harnesses"))
from capture import AuditCapture



def metadata_rows(report):
    """The template's Record metadata fields, from the JSON record."""
    known = lambda value: "unknown" if value is None else f"`{value}`"
    reviewer = report["reviewer"]
    tree = report["snapshot"]["workingTree"]
    completed = report["completedAtUtc"].split(".")[0].removesuffix("+00:00")
    phases = [f"  - {phase['name']} (model {known(phase['model'])}, reasoning effort "
              f"{known(phase['reasoningEffort'])}): {phase['scope']}" for phase in reviewer.get("phases", [])]
    artifacts = report.get("artifacts", [])
    return [
        f"- **Audit number:** {report['auditNumber']}.",
        f"- **Completed (UTC):** {completed}Z.",
        f"- **Reviewer:** {reviewer['name']}.",
        "- **Model:** " + ("; ".join(f"{phase['name']}: {known(phase['model'])}" for phase in reviewer["phases"])
                           if reviewer.get("phases") else known(reviewer["model"])) + ".",
        f"- **Reasoning effort:** {known(reviewer['reasoningEffort'])} for every phase.",
        "- **Reviewer phases:**", *phases,
        f"- **Reviewed commit:** `{report['snapshot']['commit']}`; not a complete snapshot, the uncommitted source is authoritative.",
        f"- **Working tree:** {tree['state']}; captured {tree['capturedAtUtc'].split('.')[0]}Z; source manifest SHA-256 "
        f"`{tree['sourceManifestSha256']}`; retained diff SHA-256 `{tree['diffSha256']}` (local evidence).",
        f"- **Source fingerprint:** `{report['snapshot']['sourceFingerprint']}`.",
        f"- **Artifacts:** {len(artifacts)} HTML pages bound by hash below. {report['artifactRelationship']}"
        if artifacts else f"- **Artifacts:** {report['artifactRelationship']}",
        "- **Verification level:** targeted and security-sensitive; release acceptance: not performed.",
    ]


def followup_rows(follow):
    """A later follow-up on the completed record: its own snapshot, changes, checks and gaps."""
    known = lambda value: "unknown" if value is None else f"`{value}`"
    reviewer = follow["reviewer"]
    rows = ["", "## Follow-up after completion", "",
            f"- **Date (UTC):** {follow['dateUtc']}.",
            f"- **Reviewer:** {reviewer['name']} (model {known(reviewer['model'])}, reasoning effort {known(reviewer['reasoningEffort'])}).",
            f"- **Reviewed commit:** `{follow['snapshot']['commit']}`; uncommitted source.",
            f"- **Source fingerprint:** `{follow['snapshot']['sourceFingerprint']}` ({follow['snapshot']['files']} files; {follow['snapshot']['method']}).",
            "", follow["relation"], "", "### Changes after completion", ""]
    for number, change in enumerate(follow["changes"], 1):
        paths = ", ".join(f"`{path}`" for path in change["paths"])
        rows.append(f"{number}. {change['kind'].title()} ({paths}): {change['summary']}")
    rows += ["", "### Follow-up checks", "", "| Check | Result | Evidence |", "| --- | --- | --- |"]
    for check in follow["checks"]:
        rows.append(f"| {check['name']} | {check['result']} | {', '.join(check['evidence']) or 'Command output reviewed in session'} |")
    rows += ["", follow["timing"], "", "### Follow-up observations", ""]
    rows += [f"- {item}" for item in follow["observations"]]
    rows += ["", "Not run: " + "; ".join(follow["notRun"]) + ".", "", "Local follow-up evidence (ignored, not committed):", ""]
    rows += [f"- `{name}`: `{digest}`." for name, digest in follow["evidence"].items()]
    return rows

class RemediationReport:
    """Bind dispositions to current bytes, executed checks and immutable baseline reports."""

    # Two reviewers worked on the same checkout at the same time; each phase keeps its own scope.
    REVIEWER = {
        "name": "Codex coordinator with five source reviewers; a concurrent Claude Code session",
        "model": None,
        "reasoningEffort": None,
        "phases": [
            {"name": "Codex coordinator with five source reviewers", "model": None, "reasoningEffort": None,
             "scope": "Remediation of the 28 AUD-028 roots and the AUD-026-DOC001 recurrence; the targeted checks, canonical WASM runs and reports recorded here."},
            {"name": "Claude Code session in the same checkout", "model": "claude-opus-5-5", "reasoningEffort": None,
             "scope": "Review of the remediation diff; corrections of two type errors, the module-boundary font-asset admission and two repeated blocks; the canonical WASM writer's container check (BuildKit creates no /.dockerenv; the writer now requires the /workspace checkout, which the container verifier binds to the Dockerfile WORKDIR); a concurrent canonical pnpm build:wasm (18:40-18:50 UTC) with byte-identical output; native Codex32 and Envelope tests and both editions' builds."},
        ],
    }

    # Audited anchors remain historical; BASELINES binds privacy-edited documents.
    HISTORICAL_BASELINES = {
        "multi-chain-wallet-tools": {
            "AUD-028-2026-10-12.md": "ffa5d965cafcc27a567062be6a478af0042e5ce6e6552b09bb87557fb9482ee0",
            "AUD-028-2026-10-12.json": "d13565ee8f16423c2ee539621e9e2f249b464065ae5ff4d594dab94976638211",
        },
        "dash-wallet-tools": {
            "AUD-001-2026-10-12.md": "21a5c477636fcff0add12778d90a0cfd50e9a2e56e312195222da40e9bca6b1e",
            "AUD-001-2026-10-12.json": "6d579eaa8c59fef28912bcdcbe8aa8204e66eb2a49d6ca28cae6e23de31041bc",
        },
    }

    BASELINES = {
        "multi-chain-wallet-tools": {
            "AUD-028-2026-10-12.md": "0cfed58d90ef9cb731b2750fd40e1bc211e4e70ca8e74d8ddab42c1eabc587fa",
            "AUD-028-2026-10-12.json": "f6094fc50a98ea3369e4ba626fc345aa39d8ee338bbbbf078d722e60b5e7a00f",
        },
        "dash-wallet-tools": {
            "AUD-001-2026-10-12.md": "f529b196039c981325d07410567612206b1e62edda56f1da4a59f0bbf71590df",
            "AUD-001-2026-10-12.json": "fa129407e3b97d30a3bc3de25ecaa4d80a5319fe26b18ad95d27e60e209db0c8",
        },
    }

    def __init__(self, root):
        self._root = root
        self._date = datetime.datetime.now(datetime.UTC).date().isoformat()
        self._plan = self._load(pathlib.Path(__file__).with_name("remediation.json"))
        self._base = self._load(root / "docs/audits/AUD-028-2026-10-12.json")

    @staticmethod
    def _load(path):
        return json.loads(path.read_text())

    @staticmethod
    def _hash(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _redact(self, value):
        if isinstance(value, str):
            return re.sub(r"/home/[^/\s]+(?=/|\s|$)", "/home/user", value)
        if isinstance(value, list):
            return [self._redact(item) for item in value]
        if isinstance(value, dict):
            return {key: self._redact(item) for key, item in value.items()}
        return value

    def _record(self, repository, number):
        evidence = repository / f"docs/audits/AUD-{number:03d}-evidence"
        source = self._load(evidence / "final.source.json")
        if AuditCapture(repository, number).source() != source:
            raise RuntimeError("Source changed after the final snapshot.")
        identity = self._load(evidence / "final.identity.json")
        commands = []
        for path in sorted(evidence.glob("*.command.json")):
            command = self._load(path)
            name = path.name.removesuffix(".command.json")
            log = evidence / f"{name}.log"
            if self._hash(log) != command["logSha256"]:
                raise RuntimeError(f"Command log changed: {name}")
            commands.append({**command, "name": name, "recordSha256": self._hash(path),
                             "log": log.name, "displayCommand": shlex.join(command["command"])})
        for name, expected in self.BASELINES[repository.name].items():
            if self._hash(repository / "docs/audits" / name) != expected:
                raise RuntimeError(f"Historical baseline changed: {name}")
        return {
            "schemaVersion": 1, "auditId": f"AUD-{number:03d}", "auditNumber": number,
            "date": self._date, "completedAtUtc": datetime.datetime.now(datetime.UTC).isoformat(),
            "title": f"{repository.name}: AUD-028 remediation, targeted verification",
            "reviewer": self.REVIEWER,
            "snapshot": {"commit": identity["head"].strip(), "commitComplete": False,
                         "workingTree": {"state": "pre-existing dirty primary checkout plus authorized remediation; no commit",
                                         "capturedAtUtc": identity["capturedAtUtc"],
                                         "sourceManifestSha256": self._hash(evidence / "final.source.json"),
                                         "diffSha256": self._hash(evidence / "final.diff")},
                         "sourceFingerprint": source["fingerprint"], "sourceManifest": source["files"]},
            "procedure": self._base["procedure"],
            "scope": "Remediation of all 28 AUD-028 roots and the AUD-026-DOC001 recurrence; exact source bindings and targeted/security-sensitive checks. No release verification.",
            "checks": [], "commands": commands, "findings": [], "observations": [],
            "remediation": [], "limitations": [],
            "baselineReports": self.BASELINES[repository.name],
            "harnesses": {
                str(path.relative_to(repository)): self._hash(path)
                for path in sorted((repository / f"docs/audits/AUD-{number:03d}-harnesses").glob("*"))
                if path.is_file()
            },
        }

    def _multi(self):
        report = self._record(self._root, 29)
        commands = {item["name"]: item for item in report["commands"]}
        bindings = {item["path"]: item["sha256"] for item in report["snapshot"]["sourceManifest"]}
        originals = {item["id"]: item for item in self._base["findings"]}
        for identifier, fix in self._plan.items():
            original = originals.get(identifier)
            evidence = [commands[name] for name in fix["commands"]]
            passed = all(item["exitCode"] == 0 and item["stopped"] is None for item in evidence)
            if not passed:
                raise RuntimeError(f"Required verification is incomplete: {identifier}")
            for item in evidence:
                if item["sourceAfter"] != report["snapshot"]["sourceFingerprint"]:
                    raise RuntimeError(f"Verification does not bind final source: {item['name']}")
                if item["name"] != "canonical-wasm-final" and item["sourceBefore"] != item["sourceAfter"]:
                    raise RuntimeError(f"Source changed during verification: {item['name']}")
            report["remediation"].append({
                "id": identifier, "status": "verified", "fixCommit": None,
                "verificationCommit": None, "verificationFingerprint": report["snapshot"]["sourceFingerprint"],
                "title": original["title"] if original else "Stale MHFE unreleased-local documentation claim",
                "severity": original["severity"] if original else "low",
                "originalReleaseBlocking": original["releaseBlocking"] if original else False,
                "releaseBlocking": False, "summary": fix["summary"],
                "sourceBindings": {path: bindings[path] for path in fix["files"]},
                "evidence": [f"local AUD-029-evidence/{name}.command.json" for name in fix["commands"]],
                "requiredVerification": original["requiredVerification"] if original else "Check signed release metadata and remove stale documentation.",
                "verificationScope": "Passed named targeted regressions and stated source/build checks; browser and release acceptance remain unexecuted.",
                "baselineReference": "AUD-028" if original else "AUD-026-DOC001 recurrence recorded in AUD-028",
            })
        for check in self._base["checks"]:
            current = {**check, "outcome": "partial-remediation-verified",
                       "method": "Original full-scope source review plus the named remediation regressions; see disposition and command tables.",
                       "evidence": ["targeted-final", "crypto-final", "check-final"],
                       "executionGaps": "No browsers, full vectors/statistics, full-size KDFs, bulk card/PDF output or complete release procedure."}
            if check["checkId"] == "CHECK-UI-001":
                current.update(outcome="not-run", evidence=[],
                               gap="Actual browser/viewport checks were excluded by the owner.")
            elif check["checkId"].startswith("CHECK-BLD"):
                current.update(evidence=["canonical-wasm-final", "wasm-integrity-final", "html-final", "static-artifacts-final"],
                               gap="Canonical WASM regeneration and default HTML/static checks only; no complete feature matrix, second release build, executable launchers, signing or publishing.")
            elif check["checkId"].startswith("CHECK-DOC"):
                current.update(evidence=["check-final", "mnemocode-final"],
                               gap="Current document/metadata and source-pin checks; historical audits were not replayed.")
            report["checks"].append(current)
        report["limitations"] = [
            "This follow-up verifies the named fixes at uncommitted source bytes, not release acceptance, independent certification or absence of other defects.",
            "No real browsers, viewport/focus trees, actual browser worker/CSP lifecycle or packaged executable launchers were executed. UI tests use public fixtures with bounded fake DOM/worker replies.",
            "No full vector/statistical replay, full-size password KDFs, mass PDF/cards, live providers, regtest, wallet funds or real secrets. Native and WASM checks are narrow known-answer/rejection samples.",
            "No second complete reproducible release build, full feature matrix, release bundle/signature/attestation or paid GitHub Actions. The artifact target retains those gates; this run used the separate WASM target.",
            "MnemoCode's 171 runtime files are copied unchanged from its reviewed dirty owner checkout and remain intentionally unreleased; CI release admission still requires its published handover. MHFE 0.6.0 and both Argon2 files remain unchanged.",
            "Candidate-file ceilings bound format bytes, not whole-process heap/RSS. Maximum-size files and 524288-object allocation were not tested. JS strings, GC residue and pinned-library internal copies cannot be proven erased by these tests.",
            "Actual Evo SDK empty-proof Map inclusion/omission semantics remain unobserved; complete explicit-null fixtures and missing-key rejection are checked.",
            "Prior command failures and a deliberate build interruption are retained, not converted to passes. Intermediate runs may predate final formatting or unrelated changes; accepted verification uses the specified current-source checks.",
            "The earlier remediation-probes-claude command unintentionally selected part of the chosen-word statistical suite and timed out. Its partial output is retained under AUD-028 evidence; it establishes no completed full-suite acceptance and is excluded from final counts. No such replay was repeated in the final plan.",
            "Final local provenance validated 150 pnpm integrity pins and 445 Cargo package records; all ten remote commit availability checks were unavailable (fetch failed). Local hashes are checked, remote availability is not established.",
            "Memory caps apply to the owned Docker build and recorded child groups; unrelated host processes are outside the coordinator's enforcement. Exact model/effort metadata is unavailable.",
        ]
        report["remediation"].sort(key=lambda item: (
            {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}[item["severity"]],
            item["id"],
        ))
        report["testCounts"] = {
            "targeted-final": {"files": 31, "passed": 391, "skipped": 0},
            "crypto-final": {"files": 5, "passed": 20, "skipped": 14},
            "candidate-files-final": {"files": 2, "passed": 12, "skipped": 14},
            "platform-proof-final": {"files": 1, "passed": 9, "skipped": 37},
            "build-policy-final": {"files": 5, "passed": 22, "skipped": 0},
            "native-final": {"passed": 6, "filteredOut": 5},
        }
        report["countPolicy"] = "Final selected groups contain 454 JavaScript cases and six native cases; earlier overlapping reruns and the owner's MnemoCode checks are not added to this total. Skipped cases and filtered native tests were not executed."
        artifact_paths = {
            f"dist/{edition}-edition/{tool}/{name}.html"
            for edition, prefix in [("multi-chain", ""), ("dash-community", "Dash_Community_")]
            for tool, name in [
                ("key-derivation", prefix + ("Wallet_Key_Derivation_Tool" if not prefix else "Key_Derivation_Tool")),
                ("activity-viewer", prefix + ("Wallet_Activity_Viewer" if not prefix else "Activity_Viewer")),
                ("discovery-scanner", prefix + ("Wallet_Discovery_Scanner" if not prefix else "Discovery_Scanner")),
                ("psbt-inspector", prefix + "PSBT_Multisig_Inspector"),
            ]
        }
        report["artifacts"] = [
            item for item in self._load(self._root / "docs/audits/AUD-029-evidence/final.artifacts.json")
            if item["path"] in artifact_paths
        ]
        if len(report["artifacts"]) != 8:
            raise RuntimeError("Expected eight default HTML artifacts.")
        report["artifactRelationship"] = "Built by html-final from the final source fingerprint, then checked statically by static-artifacts-final. No browser execution or release bundle acceptance. Other pre-existing dist files are excluded."
        report["summary"] = {"verifiedOriginalRoots": 28, "verifiedHistoricalRecurrences": 1,
                             "remainingFindingBlockers": [], "releaseAccepted": False,
                             "releasePrerequisites": ["Published MnemoCode handover", "Explicit release verification including browser and full-vector acceptance"]}
        mnemonic = self._load(self._root / "packages/recovery-mnemocode/source.json")
        report["upstreamBindings"] = {
            "mnemocode": {"manifest": "packages/recovery-mnemocode/source.json",
                          "manifestSha256": bindings["packages/recovery-mnemocode/source.json"],
                          "commit": mnemonic["commit"], "reference": mnemonic["reference"],
                          "unreleased": mnemonic["unreleased"], "runtimeFiles": len(mnemonic["files"])},
            "mhfe": {"version": "0.6.0", "commit": "66f142566464255e331763966b00ea1681c2dabd",
                     "manifest": "packages/recovery-mhfe-wasm/generated/modules.json",
                     "manifestSha256": bindings["packages/recovery-mhfe-wasm/generated/modules.json"],
                     "change": "Published browser package unchanged, including both Argon2 engines"},
            "sskr": {"version": "0.1.6",
                     "wasmSha256": bindings["packages/recovery-sskr-wasm/generated/recovery_sskr_wasm_bg.wasm"],
                     "handover": "Same generated bytes as the owner's existing copy; owner notified, no new commit hash exists"},
        }
        report["priorAttempts"] = [
            {"record": f"local AUD-{number:03d}-evidence/{name}.command.json",
             "recordSha256": self._hash(self._root / f"docs/audits/AUD-{number:03d}-evidence/{name}.command.json"),
             "disposition": explanation}
            for number, name, explanation in [
                (28, "remediation-build-policy", "Copy-out fake package omitted new shared footer dependencies; fixture completed, final 22 build-policy cases pass."),
                (28, "remediation-canonical-wasm", "Registry download failed before code validation; a concurrent Claude Code canonical build populated the toolchain cache, and the final build passed."),
                (28, "remediation-envelope-native", "Offline Cargo cache lacked either 1.19.0; managed cache subsequently populated, final offline native checks pass."),
                (28, "remediation-probes-claude", "Overbroad statistical selection timed out; excluded from acceptance, narrow final selectors replace it."),
                (29, "canonical-wasm", "BuildKit lacks the .dockerenv marker; the concurrent Claude Code session replaced that container check with canonical workspace admission, and source-bound integrity checks were retained."),
                (29, "canonical-wasm-rerun", "Owned build deliberately interrupted to bind shared pin/writer inputs; final canonical run completed."),
                (29, "deriver-remediation", "Ambiguous-code fixture and fake DOM radio query corrected; four assertions retained and final targeted group passes."),
                (29, "inspector-remediation", "Test compared pk CHECKSIG with multi CHECKMULTISIG; independent expected script corrected to multi(1,key), final profile regressions pass."),
                (29, "public-data-remediation", "XLSX fixture parser consumed self-closing blank cells; position-aware parsing corrected, status assertion retained."),
                (29, "security-gates-remediation", "Legitimate Node verification loaders were mistaken for runtime modules; runtime graph scope corrected with negative production-edge regressions."),
            ]
        ]
        report["consolidations"] = [
            "InspectorNetworkProfile owns address/version facts for seven consumers; BIP173/BIP350 and regtest regressions cover the shared implementation.",
            "LocalSearchAdmission and LocalSearchQueue own concurrency, range, cancellation and output order; seed owners retain cleanup responsibility.",
            "Coin path profiles own both runtime and displayed paths; protocol metadata owns optional CoinJoin identity and dispatch, including generated glue.",
            "RecoverySecretLifecycle and result ownership cover manual fields, phrase cards and alternative MnemoCode outputs; shared keyboard tabs serve both recovery levels.",
            "Shared PlatformAddressHistoryAdmission and ShieldedActivityState are composed by Viewer and Discovery; CoreActivityState owns neutral accounting and confirmation classification.",
        ]
        report["assessment"] = "All 28 original roots and the documentation recurrence passed the stated targeted verification. Full release acceptance remains incomplete and unrequested. No commits, pushes, tags or releases were made."
        return report

    def _markdown(self, report):
        rows = [f"# {report['auditId']} — {report['title']}", "", "## Record metadata", "",
                *metadata_rows(report),
                "", "## Finding register", "",
                "Original IDs are retained; the historical reports remain unchanged.", "",
                "| Original ID | Severity | Current status | Title |", "| --- | --- | --- | --- |"]
        for item in report["remediation"]:
            rows.append(f"| {item['id']} | {item['severity']} | {item['status']} | {item['title']} |")
        rows += ["", "## Review evidence", "", "### Scope and methodology", "", report["scope"], "",
                 "Procedure SHA-256 bindings:", ""]
        rows += [f"- `{name}`: `{digest}`." for name, digest in report["procedure"].items()]
        rows += ["", "### Coverage ledger", "", "| Check | Outcome | Remaining gap |", "| --- | --- | --- |"]
        rows += [f"| {item['checkId']} | {item['outcome']} | {item['gap']} |" for item in report["checks"]]
        rows += ["", "### Checks", "", "Exact commands, UTC intervals, source-before/after fingerprints and log hashes are carried by the JSON companion. Evidence paths are local and ignored.", "",
                 "| Command record | Exit | Log SHA-256 | Exact command |", "| --- | --- | --- | --- |"]
        for item in report["commands"]:
            rows.append(f"| local {item['name']} | {item['exitCode']} | `{item['logSha256']}` | `{item['displayCommand']}` |")
        if "testCounts" in report:
            rows += ["", report["countPolicy"], "", "| Final group | Passed | Skipped / filtered |", "| --- | --- | --- |"]
            for name, counts in report["testCounts"].items():
                rows.append(f"| {name} | {counts['passed']} | {counts.get('skipped', counts.get('filteredOut', 0))} |")
            rows += ["", "### Local artifacts", "", report["artifactRelationship"], ""]
            rows += [f"- `{item['path']}`: `{item['sha256']}` ({item['bytes']} bytes)." for item in report["artifacts"]]
        if "upstreamBindings" in report:
            rows += ["", "### Upstream handover", ""]
            rows += [f"- {name}: `{json.dumps(value, sort_keys=True)}`." for name, value in report["upstreamBindings"].items()]
            rows += ["", "### Earlier attempts retained", ""]
            rows += [f"- {item['record']} (`{item['recordSha256']}`): {item['disposition']}" for item in report["priorAttempts"]]
        rows += ["", "### Remediation and follow-up", ""]
        for item in report["remediation"]:
            rows += [f"#### {item['id']} — {item['severity'].title()} — {item['title']}", "",
                     f"- Status: {item['status']}; fix/verification commits: not created.",
                     f"- Correction: {item['summary']}",
                     f"- Verification scope: {item['verificationScope']}",
                     f"- Required verification: {item['requiredVerification']}",
                     f"- Evidence: {'; '.join(item['evidence'])}.",
                     "- Source SHA-256 bindings:"]
            rows += [f"  - `{path}`: `{digest}`." for path, digest in item['sourceBindings'].items()]
            rows.append("")
        rows += ["### Informational observations and recommendations", ""]
        rows += [f"- {text}" for text in report.get("consolidations", [])]
        rows += ["", "### Assessment and limitations", "", report["assessment"], ""]
        rows += [f"- {text}" for text in report["limitations"]]
        if "followUp" in report:
            rows += followup_rows(report["followUp"])
        return "\n".join(rows) + "\n"

    def _save(self, repository, report):
        report = self._redact(report)
        stem = f"AUD-{report['auditNumber']:03d}-{report['date']}"
        directory = repository / "docs/audits"
        (directory / f"{stem}.json").write_text(json.dumps(report, indent=2) + "\n")
        (directory / f"{stem}.md").write_text(self._markdown(report))
        return report

    def run(self):
        multi = self._save(self._root, self._multi())
        dash_root = self._root.parent / "dash-wallet-tools"
        dash = self._record(dash_root, 2)
        original_dash = self._load(dash_root / "docs/audits/AUD-001-2026-10-12.json")
        dash.update(scope="Distribution resolver, unchanged release workflow/document pins and inherited upstream remediation; no release executed.",
                    checks=[{**item, **({"outcome": "partial-remediation-verified",
                                       "gap": "Distribution resolver/static checks and AUD-029 upstream verification only; no signed artifact downloads, publication, launcher execution or complete release procedure."}
                                      if item["outcome"] != "not-applicable" else {})}
                            for item in original_dash["checks"]],
                    limitations=multi["limitations"],
                    assessment="No distribution-specific defects were found in the baseline. Upstream finding dispositions are verified by AUD-029; a dirty unpublished working tree is not release-selectable or release acceptance.")
        dash["upstreamAudit"] = {"auditId": "AUD-029", "sourceFingerprint": multi["snapshot"]["sourceFingerprint"],
                                 "verifiedRootIds": [item["id"] for item in multi["remediation"]], "releaseAccepted": False}
        dash["testCounts"] = {"release-resolver-final": {"passed": 13}}
        dash["countPolicy"] = "Thirteen synthetic release-selection cases execute the actual workflow Bash locally; no network requests or publication. Inherited runtime cases are reported once in AUD-029."
        dash["artifacts"] = []
        dash["artifactRelationship"] = "The four freshly built Dash Community HTML pages are source-bound in upstream AUD-029; this distribution repository did not download or publish release assets."
        self._save(dash_root, dash)


if __name__ == "__main__":
    RemediationReport(pathlib.Path(__file__).resolve().parents[3]).run()
