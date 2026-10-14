"""Generate AUD-030 from retained evidence; never run checks, builds or browsers.

Parent commands, from the repository root:
    python3 docs/audits/AUD-030-harnesses/report.py
    python3 docs/audits/AUD-030-harnesses/report.py --check

Requires parity-final.source.json, .identity.json and .artifacts.json in the
ignored AUD-030-evidence directory. AUD-028 AuditCapture owns that snapshot
format. Earlier commands remain evidence even when they failed or changed source.
"""

import collections
import datetime
import json
import pathlib
import re
import runpy
import shlex
import sys


ROOT = pathlib.Path(__file__).resolve().parents[3]
# Both historical entry points are guarded; run_path loads definitions only.
LEGACY = runpy.run_path(str(ROOT / "docs/audits/AUD-029-harnesses/report.py"))
BASELINE_HELPERS = runpy.run_path(str(ROOT / "docs/audits/AUD-028-harnesses/report.py"))
AuditCapture = LEGACY["AuditCapture"]


class ParityReport(LEGACY["RemediationReport"]):
    """Bind a compact follow-up to final bytes and actual recorded outcomes."""

    FINAL_LABELS = (
        "types-bound-final", "passive-final", "passive-corrected", "plaintext-final", "format-bound-final",
        "html-final", "artifacts-final",
    )
    PROCEDURES = (
        "docs/FULL_AUDIT_GUIDE.md", "docs/audits/AUDIT_STANDARD.md",
        "docs/audits/AUDIT_TEMPLATE.md", "docs/audit-report.schema.json",
    )
    FIX_PATHS = {
        "FUN": (
            "packages/shared-ui/src/literal-secret-field.ts",
            "packages/shared-ui/src/text-file-import.ts",
            "apps/key-derivation/src/ui/recovery-mnemocode-evidence.ts",
            "apps/key-derivation/src/ui/recovery-mnemocode-list.ts",
            "apps/key-derivation/src/partials/mnemocode-wallet-fields.html",
            "apps/key-derivation/src/index.html",
        ),
        "SEC": (
            "packages/shared-ui/src/payment-qr.ts",
            "apps/key-derivation/src/ui/recovery-workspace-shared.ts",
            "apps/key-derivation/src/ui/recovery-mnemocode-encode.ts",
        ),
    }
    SUMMARY_LINE = re.compile(
        r"^\s*(?:Test Files\s|Tests\s|test result:|# (?:tests|pass|fail|skip|todo)\b)"
        r"|\b\d+ (?:passed|failed|skipped|filtered out|cases)\b"
    )
    DIAGNOSTIC_LINE = re.compile(
        r"\b(?:FAIL|AssertionError|ReferenceError|TypeError|SyntaxError|Error:)\b"
        r"|error TS\d+|^\s*(?:Expected|Received|Caused by|not ok\b)"
    )
    ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")

    def __init__(self):
        self._root = ROOT
        self._harness = pathlib.Path(__file__).resolve().parent
        self._evidence = ROOT / "docs/audits/AUD-030-evidence"
        self._inputs = {}
        self._capture = AuditCapture(ROOT, 30)

    @staticmethod
    def _pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result

    @staticmethod
    def _constant(value):
        raise ValueError(f"Non-finite JSON constant: {value}")

    def _text(self, path):
        path = pathlib.Path(path)
        digest = AuditCapture.hash_file(path)
        value = path.read_text(encoding="utf-8")
        if AuditCapture.hash_file(path) != digest:
            raise RuntimeError(f"Input changed while reading: {path.name}")
        self._inputs[path] = digest
        return value

    def _json(self, path):
        return json.loads(
            self._text(path), object_pairs_hook=self._pairs, parse_constant=self._constant
        )

    def _binding(self, path):
        path = pathlib.Path(path)
        digest = AuditCapture.hash_file(path)
        self._inputs[path] = digest
        return digest

    @staticmethod
    def _utc(value):
        instant = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if instant.tzinfo is None:
            raise ValueError("Evidence timestamps must include an explicit timezone")
        return instant.astimezone(datetime.UTC).isoformat(timespec="microseconds")

    @staticmethod
    def _sha(value):
        if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
            raise ValueError("Expected a SHA-256 binding")
        return value

    def _commands(self, fingerprint):
        commands = []
        for path in sorted(self._evidence.glob("*.command.json")):
            raw = self._json(path)
            name = path.name.removesuffix(".command.json")
            log = self._evidence / f"{name}.log"
            output = self._text(log)
            if self._inputs[log] != self._sha(raw["logSha256"]):
                raise RuntimeError(f"Retained log hash changed: {name}")
            if not isinstance(raw.get("command"), list) or not all(
                isinstance(part, str) for part in raw["command"]
            ):
                raise ValueError(f"Invalid command argv: {name}")
            if type(raw.get("exitCode")) is not int:
                raise ValueError(f"Missing actual exit code: {name}")
            stops = [raw.get(key) for key in ("stopReason", "stopped")]
            if not any(key in raw for key in ("stopReason", "stopped")):
                raise ValueError(f"Missing stop disposition: {name}")
            started = self._utc(raw.get("startedAtUtc", raw.get("startedAt", "")))
            ended = self._utc(raw.get("endedAtUtc", raw.get("endedAt", "")))
            if ended < started:
                raise ValueError(f"Command ended before it started: {name}")
            before = self._sha(raw["sourceBefore"])
            after = self._sha(raw["sourceAfter"])
            changed = raw.get("changedFiles", raw.get("sourceChangesDuringCommand"))
            if not isinstance(changed, list):
                raise ValueError(f"Missing changed-source list: {name}")
            stable = before == after and not changed
            bound = stable and after == fingerprint
            if any(reason is not None for reason in stops):
                outcome = "stopped"
            elif raw["exitCode"] != 0:
                outcome = "failed"
            elif not stable:
                outcome = "passed-with-source-change"
            else:
                outcome = "passed-final-source" if bound else "passed-earlier-source"
            lines = self.ANSI.sub("", output).splitlines()
            commands.append({
                **raw, "name": name, "recordSha256": self._inputs[path],
                "log": f"local AUD-030-evidence/{log.name}",
                "displayCommand": shlex.join(raw["command"]),
                "startedAtUtc": started, "endedAtUtc": ended,
                "sourceStable": stable, "boundToFinalSource": bound,
                "outcome": outcome,
                "reportedCountLines": [line for line in lines if self.SUMMARY_LINE.search(line)],
                "diagnosticLines": [line for line in lines if self.DIAGNOSTIC_LINE.search(line)],
                "outputPolicy": "Count/diagnostic lines are excerpts, not new totals. Complete original output, failures and local clock text remain in the immutable local log bound above.",
            })
        return commands

    @staticmethod
    def _passed(commands, name):
        return commands.get(name, {}).get("outcome") == "passed-final-source"

    def _matrix(self):
        path = self._harness / "parity-matrix.json"
        matrix = self._json(path)
        rows = matrix["rows"]
        expected = [f"P{number:02d}" for number in range(1, 61)]
        if [row["id"] for row in rows] != expected:
            raise ValueError("The matrix must enumerate P01-P60 exactly once in order")
        required = (
            "cliSemantics", "cliOptions", "browserControlIds", "sharedOwnerCalls",
            "refusalMapping", "progressMapping", "cancelMapping", "outputMapping",
            "state", "sourceRefs", "pendingValidation",
        )
        states = set(matrix["scope"]["stateDefinitions"])
        for row in rows:
            if any(key not in row for key in required) or row["state"] not in states:
                raise ValueError(f"Incomplete matrix row: {row['id']}")
        return {
            "path": str(path.relative_to(ROOT)), "sha256": self._inputs[path],
            "rows": rows, "stateCounts": dict(collections.Counter(row["state"] for row in rows)),
            "interpretation": "All 60 rows are static mappings, not 60 executed cases. Final handoffs resolve confirmed source omissions; acceptance gaps remain explicit; named passive tests cover only their selected fixtures. Matrix states do not confer browser acceptance.",
            "realBrowserGaps": ["P58", "P60", "CHECK-UI-001"],
            "ownerSourceIdentity": matrix.get("upstream", {}),
        }

    def _artifacts(self, baseline, commands):
        snapshot = self._json(self._evidence / "parity-final.artifacts.json")
        # AUD-029 supplies the default eight-page names; none of its old hashes are reused.
        expected = {item["path"] for item in baseline["artifacts"]}
        if len(expected) != 8 or any(
            re.fullmatch(r"dist/(multi-chain|dash-community)-edition/[^/]+/[^/]+\.html", path)
            is None for path in expected
        ):
            raise ValueError("AUD-029 must identify exactly the eight default HTML paths")
        indexed = {}
        for item in snapshot:
            if item["path"] in indexed:
                raise ValueError("Duplicate final artifact path")
            indexed[item["path"]] = item
        selected = []
        for name in sorted(expected):
            item = indexed[name]
            path = ROOT / name
            if self._binding(path) != self._sha(item["sha256"]) or path.stat().st_size != item["bytes"]:
                raise RuntimeError(f"Final default artifact changed: {name}")
            selected.append({**item, "sourceFingerprint": self._source["fingerprint"]})
        fresh = all(self._passed(commands, name) for name in ("html-final", "artifacts-final"))
        return (selected if fresh else []), {
            "expectedDefaultPages": 8, "freshnessAccepted": fresh,
            "snapshotSha256": self._inputs[self._evidence / "parity-final.artifacts.json"],
            "relationship": "Only the default eight HTML pages can be accepted as fresh, after source-bound html-final and artifacts-final pass. All other old dist files are excluded, not counted or re-certified. No real browser or canonical release build is inferred.",
        }

    def _findings(self, commands):
        bindings = {item["path"]: item["sha256"] for item in self._source["files"]}
        text = {}
        for paths in self.FIX_PATHS.values():
            for name in paths:
                if name in bindings:
                    text[name] = self._text(ROOT / name)
        implemented = {
            "FUN": all("LiteralSecretField" in text.get(name, "") for name in (
                self.FIX_PATHS["FUN"][0], self.FIX_PATHS["FUN"][2], self.FIX_PATHS["FUN"][3]
            )),
            "SEC": "if (!current()) return false" in text.get(self.FIX_PATHS["SEC"][0], "")
            and "current: revealed" in text.get(self.FIX_PATHS["SEC"][1], "")
            and "jobs.ready" in text.get(self.FIX_PATHS["SEC"][2], ""),
        }
        verified = all(self._passed(commands, name) for name in ("types-bound-final", "passive-final"))
        specs = [
            {
                "id": "AUD-030-SEC001", "category": "SEC", "severity": "medium",
                "title": "Delayed private QR PNG export can publish after Clear or gate loss",
                "matrixRows": ["P52", "P59"],
                "reproduction": "Use a public synthetic Encode payload, reveal it, open its QR and press Save as PNG. Hold the canvas.toBlob callback, Clear the result or disable readiness, then release the callback. The production path is renderSensitiveShares -> createQrAction -> QR PNG exporter.",
                "expected": "The captured private result's ownership and readiness must still permit export after asynchronous PNG encoding; otherwise no download is published.",
                "observed": "The owner-confirmed original path awaited toBlob then downloaded without that final predicate. Removing its DOM controls did not revoke the captured continuation. This is the confirmed root, not a newly executed browser observation.",
                "impact": "An export can outlive the user's Clear or lost secret gate and write private material to the download destination. It requires an initially authorized Save and delayed encoding; no network transmission, actual funds or demonstrated filesystem disclosure is claimed.",
                "recommendedFix": "The shared QR exporter rechecks its owning predicate before and after toBlob, disposes canvas state, and the sensitive renderer passes result connectivity/reveal/readiness ownership rather than adding another QR workflow.",
            },
            {
                "id": "AUD-030-FUN001", "category": "FUN", "severity": "low",
                "title": "Supported multiline secret files are refused and Show leaves passwords masked",
                "matrixRows": ["P31", "P33"],
                "reproduction": "Import a UTF-8 file containing a public synthetic BIP39 password with internal CR/LF into a MnemoCode wallet evidence field, then press Show. Repeat with a sufficiently long synthetic candidate-list passphrase file. Compare with the applicable upstream CLI file readers, not an unused export.",
                "expected": "Preserve supported literal internal CR/LF, BOM and spaces according to each shared parser; the BIP39 file reader removes only one final CRLF/LF. Show/Hide must reveal and conceal the actual field without changing the secret or canonical request snapshot.",
                "observed": "The owner-confirmed single-line import refused remaining line breaks even though CLI accepts them. The prior CSS-only Show toggle did not unmask type=password. This is the original root; no new runtime is attributed to this generator.",
                "impact": "A supported password file cannot reproduce the same wallet or list-encryption input in the page, and the person cannot inspect the actual imported value with Show. No cryptographic weakness or loss of funds is demonstrated.",
                "recommendedFix": "Use the shared LiteralSecretField with concealed textareas and a canonical import snapshot; reuse the owner for candidate-list passphrases while retaining their shared BOM/end normalization.",
            },
        ]
        for finding in specs:
            category = finding["category"]
            complete = all(name in bindings for name in self.FIX_PATHS[category])
            fixed = complete and implemented[category]
            finding.update(
                kind="finding", status="verified" if fixed and verified else "fixed" if fixed else "open",
                verificationStatus="targeted-final-source" if fixed and verified else "fixed; bounded regressions passed within a retained partial batch; browser acceptance unexecuted" if fixed else "pending",
                releaseBlocking=True,
                releaseBlockingReason="This supported secret workflow needs the scoped correction and final acceptance; full release remains blocked separately by upstream handover and actual browser gaps.",
                affectedFiles=list(self.FIX_PATHS[category]),
                sourceBindings={name: bindings[name] for name in self.FIX_PATHS[category] if name in bindings},
                implementationAssessment="Source markers only; they are not an independent functional test or owner handoff.",
                evidence=[f"local AUD-030-evidence/{name}.command.json" for name in ("types-bound-final", "passive-final") if name in commands],
                requiredVerification="This generator conservatively keeps the two corrections fixed because the retained combined batch was not entirely green; its five template formatting failures were resolved by the separate 29-case template pass. The secret/QR fixtures passed in the original batch, but are not represented as a new all-green replay. Preserve all earlier failures; actual browser file/reveal/worker/PNG lifecycle acceptance remains unexecuted and is not implied by passive DOM fixtures.",
                limitations="Bounded public synthetic fixtures and static owner evidence only; no real browser, PDF gallery, full vectors, real secret, release execution or certification.",
            )
        return specs

    def _ledger(self, baseline, commands, procedure_text):
        previous = baseline["checks"]
        ids = [item["checkId"] for item in previous]
        guide_ids = re.findall(r"^### (CHECK-[A-Z]+-\d{3})\b", procedure_text, re.MULTILINE)
        if len(ids) != 32 or len(set(ids)) != 32 or set(ids) != set(guide_ids):
            raise ValueError("AUD-029 titles must cover all 32 current CHECK IDs")
        scoped = {
            "CHECK-SEC-005": ("types-bound-final", "passive-final"),
            "CHECK-SEC-006": ("types-bound-final", "passive-final"),
            "CHECK-FUN-006": ("types-bound-final", "passive-final"),
            "CHECK-FUN-007": ("plaintext-final",),
            "CHECK-API-002": ("types-bound-final", "passive-final"),
            "CHECK-API-004": ("passive-final", "plaintext-final"),
            "CHECK-BLD-001": ("html-final", "artifacts-final"),
            "CHECK-BLD-005": ("html-final", "artifacts-final"),
            "CHECK-UI-002": ("passive-final",),
            "CHECK-UI-003": ("passive-final",),
            "CHECK-ARC-001": ("types-bound-final",),
            "CHECK-DOC-001": ("format-bound-final",),
            "CHECK-DOC-002": ("format-bound-final",),
            "CHECK-DOC-003": ("format-bound-final",),
        }
        result = []
        for old in previous:
            check = {"checkId": old["checkId"], "title": old["title"], "owner": "parent coordinator"}
            labels = scoped.get(check["checkId"], ())
            if check["checkId"] == "CHECK-UI-001":
                check.update(outcome="not-run", method="Real-browser execution excluded.", evidence=[], gap="Real files/viewports, browser workers, CSP, focus and downloads were not executed. Node or passive DOM success is not browser equivalence.")
            elif labels:
                check.update(
                    outcome="partial-targeted-pass" if all(self._passed(commands, name) for name in labels) else "partial-unverified",
                    method="Existing scoped remediation and named evidence only; not a fresh full-category audit.",
                    evidence=[f"local AUD-030-evidence/{name}.command.json" for name in labels if name in commands],
                    gap="Only the named subset is recorded. Browser acceptance, full vectors, canonical release/reproducibility and unrelated category cases were not replayed.",
                )
            else:
                check.update(outcome="not-replayed", method="Unaffected historical AUD-029 area; no new replay or pass inferred.", evidence=[], gap="Historical findings/results remain with their original snapshot; this follow-up does not repeat them.")
            result.append(check)
        return result

    def build(self):
        self._source = self._json(self._evidence / "parity-final.source.json")
        if self._capture.source() != self._source:
            raise RuntimeError("Current source differs from parity-final; capture final bytes first")
        self._sha(self._source["fingerprint"])
        identity_path = self._evidence / "parity-final.identity.json"
        identity = self._json(identity_path)
        captured = self._utc(identity["capturedAtUtc"])
        commit = identity["head"].strip()
        if re.fullmatch(r"[0-9a-f]{40}", commit) is None:
            raise ValueError("Invalid captured commit identity")
        baseline_path = ROOT / "docs/audits/AUD-029-2026-10-12.json"
        baseline = self._json(baseline_path)
        commands = self._commands(self._source["fingerprint"])
        indexed = {item["name"]: item for item in commands}
        matrix = self._matrix()
        procedures = {name: self._binding(ROOT / name) for name in self.PROCEDURES}
        guide = self._text(ROOT / self.PROCEDURES[0])
        artifacts, artifact_status = self._artifacts(baseline, indexed)
        findings = self._findings(indexed)
        # Keep the received report bytes: later owner dispositions do not rewrite this handover.
        upstream_path = self._evidence / "owner-report-handover.json"
        upstream = self._json(upstream_path)
        external = next(item for item in upstream["findings"] if item["id"] == "AUD-021-BLD001")
        completed = max([captured, *[item["endedAtUtc"] for item in commands]])
        diff = self._evidence / "parity-final.diff"
        diff_hash = self._binding(diff) if diff.exists() else None
        final_commands = {
            name: {"outcome": indexed[name]["outcome"], "exitCode": indexed[name]["exitCode"],
                   "sourceStable": indexed[name]["sourceStable"], "boundToFinalSource": indexed[name]["boundToFinalSource"]}
            if name in indexed else {"outcome": "not-run", "exitCode": None, "sourceStable": None, "boundToFinalSource": False}
            for name in self.FINAL_LABELS
        }
        report = {
            "schemaVersion": 1, "auditId": "AUD-030", "auditNumber": 30, "date": "2026-10-13",
            "title": "MnemoCode browser parity: scoped remediation and recorded final checks",
            "reportTimeZone": "UTC (+00:00)", "completedAtUtc": completed,
            "reviewer": {"name": "Codex coordinator and scoped source agents; parent-recorded execution", "model": None, "reasoningEffort": None, "phases": []},
            "snapshot": {
                "commit": commit, "commitComplete": False, "sourceFingerprint": self._source["fingerprint"],
                "sourceManifest": self._source["files"],
                "workingTree": {"state": "Existing dirty primary checkout with authorized scoped remediation; no audit commit", "capturedAtUtc": captured, "sourceManifestSha256": self._inputs[self._evidence / "parity-final.source.json"], "identitySha256": self._inputs[identity_path], "diffSha256": diff_hash},
            },
            "procedure": procedures,
            "scope": "Compact continuation of AUD-029, owner-authorized MnemoCode parity integration and two confirmed roots. All P01-P60 are inventoried statically; only retained named command subsets are tested. This is not a fresh full audit or release verification.",
            "checks": self._ledger(baseline, indexed, guide), "commands": commands,
            "finalCommands": final_commands, "findings": findings,
            "observations": [], "parityMatrix": matrix,
            "baselineReference": {"report": "AUD-029-2026-10-12.json", "sha256": self._inputs[baseline_path], "relation": "Historical results preserved; titles/path names reused without replaying or reusing their artifact hashes."},
            "externalFinding": {"id": external["id"], "title": external["title"], "status": "open", "releaseBlocking": True, "ownerRecordedStatus": external["status"], "report": "../../../mnemocode/docs/audits/AUD-021-2026-10-13.json", "reportSha256": self._inputs[upstream_path], "disposition": "Partial browser remediation only. Owner upstream remains intentionally unreleased; actual browser parity is unaccepted. This report cannot close the external finding."},
            "artifacts": artifacts, "artifactStatus": artifact_status,
            "artifactRelationship": artifact_status["relationship"],
            "testCounts": {item["name"]: item["reportedCountLines"] for item in commands if item["reportedCountLines"]},
            "countPolicy": "Reported log summaries are kept per command. Suites, overlapping reruns, skipped/filtered cases and owner upstream results are not added. The partial 393-case batch has 388 passes and five template failures; its 29-case template file already contributes 24 passes. The separate 29-case corrected rerun is overlapping evidence, not another 29 distinct cases. Compile/build/static checks do not imply runtime cases.",
            "remediation": [{"id": item["id"], "status": item["status"], "fixCommit": None, "verificationCommit": None, "evidence": item["evidence"]} for item in findings] + [{"id": "AUD-021-BLD001", "status": "open", "fixCommit": None, "verificationCommit": None, "evidence": "Static matrix and targeted browser-host remediation only; owner release and real-browser acceptance remain open."}],
            "limitations": [
                "All prior command attempts, exit failures, stops, source changes and reported counts are retained; earlier-source passes are not final-source verification.",
                "No actual browser, browser worker/CSP/focus/download acceptance, full vectors/statistics, full-size password KDF, PDF gallery, live providers, Docker/reproducible release build, release signing or publication was executed by this report generator.",
                "Passive DOM/worker/canvas fixtures are bounded host probes, not Node proof of browser equivalence. P58/P60 and CHECK-UI-001 remain real-browser gaps even when selected checks pass.",
                "The two final roots are fixed; their passive fixtures passed within a partial batch. Five unrelated template-whitespace failures were corrected and that file passed separately. No 393-case all-green replay is claimed, and these checks neither certify the entire matrix nor close the external root.",
                "Source bindings identify dirty bytes, not a release-selectable commit. Default HTML hashes cover only the fresh eight pages after recorded build/static admission; other existing dist files are excluded.",
                "No real wallet material, funds, PDF/card gallery or executed cryptographic vector replay is introduced here. JavaScript/string/GC erasure and whole-process memory bounds are not proved.",
                "Optional P48 field visibility is cosmetic only and is neither a new finding nor remediation work in this report.",
            ],
            "assessment": "Unreleased upstream handover and actual browser acceptance gaps block full release. Named final-source targeted checks may verify only the two scoped roots; no complete fresh audit, certification or blanket parity acceptance is claimed.",
        }
        report["harnesses"] = {
            str(path.relative_to(ROOT)): self._binding(path)
            for path in sorted(self._harness.iterdir())
            if path.is_file() and path.suffix in {".py", ".mjs", ".json", ".md"}
        }
        report["sharedHarnessBindings"] = {
            name: self._binding(ROOT / name) for name in (
                "docs/audits/AUD-028-harnesses/capture.py",
                "docs/audits/AUD-028-harnesses/report.py",
                "docs/audits/AUD-029-harnesses/report.py",
            )
        }
        return self._redact(report)

    def markdown(self, report):
        cell = BASELINE_HELPERS["AuditReportGenerator"]._cell
        rows = [f"# {report['auditId']} — {report['title']}", "", "## Record metadata", "",
                *LEGACY["metadata_rows"](report), "- **Report time zone:** UTC (+00:00).", "",
                "## Finding register", "", "| ID | Category | Kind | Severity | Status | Title |",
                "| --- | --- | --- | --- | --- | --- |"]
        for item in report["findings"]:
            rows.append("| " + " | ".join(cell(item[key]) for key in ("id", "category", "kind", "severity", "status", "title")) + " |")
        rows += ["", "External **AUD-021-BLD001 remains open**, with partial browser remediation only; its upstream report and hash are in the JSON companion.", "",
                 "## Review evidence", "", "### Scope and methodology", "", report["scope"], "",
                 report["parityMatrix"]["interpretation"], "", "All exact command records, source manifests, per-command count/diagnostic excerpts, matrix rows and shared harness hashes are in the JSON companion. Original full logs are local ignored evidence. No agent runtime is manufactured by generation.", "",
                 "Procedure bindings:", ""]
        rows += [f"- `{name}`: `{digest}`." for name, digest in report["procedure"].items()]
        rows += ["", "### Coverage ledger", "", "| Check | AUD-029 title | Outcome | Evidence / gap |", "| --- | --- | --- | --- |"]
        for item in report["checks"]:
            rows.append("| " + " | ".join(cell(value) for value in (item["checkId"], item["title"], item["outcome"], "; ".join(item["evidence"]) + " " + item["gap"])) + " |")
        rows += ["", "### Checks", "", report["countPolicy"], "", "| Local command | Actual outcome / exit | Count lines / stops | Exact command | Log SHA-256 |", "| --- | --- | --- | --- | --- |"]
        for item in report["commands"]:
            detail = "; ".join(item["reportedCountLines"]) or "No case count reported"
            stops = item.get("stopReason", item.get("stopped"))
            if stops is not None:
                detail += f"; stopped: {stops}"
            delimiter = "`" * (max((len(run) for run in re.findall(r"`+", item["displayCommand"])), default=0) + 1)
            command = delimiter + item["displayCommand"] + delimiter
            rows.append("| " + " | ".join(cell(value) for value in (item["name"], f"{item['outcome']} / {item['exitCode']}", detail, command, item["logSha256"])) + " |")
        rows += ["", "Named final labels:", ""]
        rows += [f"- `{name}`: {facts['outcome']}; exit {facts['exitCode']}." for name, facts in report["finalCommands"].items()]
        rows += ["", "### Findings", ""]
        for item in report["findings"]:
            rows += [f"#### {item['id']} — {item['severity'].title()} — {item['title']}", ""]
            for label, key in (("Category", "category"), ("Status", "status"), ("Release blocking", "releaseBlocking"), ("Reproduction", "reproduction"), ("Expected", "expected"), ("Observed original root", "observed"), ("Impact", "impact"), ("Recommended fix", "recommendedFix"), ("Required verification", "requiredVerification"), ("Limitations", "limitations")):
                rows.append(f"- **{label}:** {item[key]}")
            rows += ["- **Evidence:** " + ("; ".join(item["evidence"]) or "Final named checks not run; owner-confirmed static root and matrix retained."), "- **Current source SHA-256 bindings:**"]
            rows += [f"  - `{name}`: `{digest}`." for name, digest in item["sourceBindings"].items()]
            rows.append("")
        rows += ["### Remediation and follow-up", "", "| ID | Status | Fix / verification commit | Evidence |", "| --- | --- | --- | --- |"]
        for item in report["remediation"]:
            evidence = item["evidence"] if isinstance(item["evidence"], str) else "; ".join(item["evidence"])
            rows.append(f"| {item['id']} | {item['status']} | None created | {cell(evidence)} |")
        rows += ["", "### Informational observations and recommendations", "", "P48 field visibility is optional cosmetic clarity only; no new finding or change is requested.", "", "### Local artifacts", "", report["artifactRelationship"], ""]
        rows += [f"- `{item['path']}`: `{item['sha256']}` ({item['bytes']} bytes)." for item in report["artifacts"]]
        if not report["artifacts"]:
            rows.append("No default artifact is claimed fresh: named final build/static evidence is missing or not passing on the final source.")
        rows += ["", "### Assessment and limitations", "", report["assessment"], ""]
        rows += [f"- {text}" for text in report["limitations"]]
        return "\n".join(rows) + "\n"

    def _validate(self, report, markdown):
        schema = self._json(ROOT / "docs/audit-report.schema.json")
        if any(key not in report for key in schema["required"]):
            raise ValueError("Canonical report envelope is incomplete")
        record_fields = schema["$defs"]["record"]["required"]
        statuses = schema["$defs"]["status"]["enum"]
        for finding in report["findings"]:
            if any(key not in finding for key in record_fields) or finding["status"] not in statuses:
                raise ValueError("Canonical finding fields/status are incomplete")
            if re.fullmatch(schema["$defs"]["findingId"]["pattern"], finding["id"]) is None:
                raise ValueError("Finding ID is not canonical")
            if finding["status"] == "verified" and not all(
                report["finalCommands"][name]["outcome"] == "passed-final-source"
                for name in ("types-bound-final", "passive-final")
            ):
                raise ValueError("Unbound verified disposition")
            if finding["id"] not in markdown:
                raise ValueError("Paired report omits a finding")
        if len({item["id"] for item in report["findings"]}) != len(report["findings"]):
            raise ValueError("Duplicate finding ID")
        if report["reviewer"]["model"] is not None or report["reviewer"]["reasoningEffort"] is not None:
            raise ValueError("Unknown reviewer settings must remain null")
        serialized = json.dumps(report, allow_nan=False)
        if re.search(r"/home/(?!user(?:/|\s|\"|$))[^/\s]+", serialized + markdown):
            raise ValueError("Unredacted home-directory owner in published report")
        for path, digest in self._inputs.items():
            if AuditCapture.hash_file(path) != digest:
                raise RuntimeError(f"Input changed during generation: {path.name}")
        if self._capture.source() != self._source:
            raise RuntimeError("Source changed during generation")

    def run(self, check=False):
        report = self.build()
        markdown = self.markdown(report)
        self._validate(report, markdown)
        stem = ROOT / "docs/audits/AUD-030-2026-10-13"
        if check:
            actual = self._json(stem.with_suffix(".json"))
            actual_markdown = self._text(stem.with_suffix(".md"))
            # Prettier adjusts table column padding; those separators carry no report data.
            def words(value):
                return re.sub(r"^\s*\|(?:\s*:?-+:?\s*\|)+\s*$", "", value,
                              flags=re.MULTILINE).split()
            if actual != report or words(actual_markdown) != words(markdown):
                raise ValueError("Paired reports differ from retained final inputs")
            self._validate(actual, actual_markdown)
            print("AUD-030 pair, source, log, matrix and procedure bindings checked; no audit rerun.")
        else:
            stem.with_suffix(".json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
            stem.with_suffix(".md").write_text(markdown, encoding="utf-8")
            print("Generated AUD-030 Markdown/JSON from retained evidence; no checks executed.")


if __name__ == "__main__":
    if sys.argv[1:] not in ([], ["--check"]):
        raise SystemExit("Usage: report.py [--check]")
    ParityReport().run(check=sys.argv[1:] == ["--check"])
