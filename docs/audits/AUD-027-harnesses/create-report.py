"""Publish a privacy-normalized follow-up from the retained command and scoped review records."""

import collections
import datetime
import hashlib
import json
import pathlib
import re
import subprocess


class FollowupReport:
    def __init__(self):
        self.root = pathlib.Path(__file__).resolve().parents[3]
        self.evidence = self.root / "docs/audits/AUD-027-evidence"
        self.audits = self.root / "docs/audits"

    def read(self, name):
        return json.loads((self.evidence / name).read_text())

    def source(self):
        paths = subprocess.check_output(
            ["git", "ls-files", "-co", "--exclude-standard", "-z"], cwd=self.root
        ).decode().split("\0")
        files = []
        for name in sorted(set(paths) - {""}):
            path = self.root / name
            if name.startswith("docs/audits/") or not path.is_file():
                continue
            files.append({"path": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
        fingerprint = hashlib.sha256(
            "".join(f"{f['sha256']}  {f['path']}\n" for f in files).encode()
        ).hexdigest()
        return {"fingerprint": fingerprint, "files": files}

    def normalize(self, value):
        # Published prose/JSON anonymize paths. Original local records/logs remain untouched.
        if isinstance(value, str):
            return re.sub(r"/home/[^/\s\"'<>]+(?=/)", "/home/user", value)
        if isinstance(value, list):
            return [self.normalize(item) for item in value]
        if isinstance(value, dict):
            return {self.normalize(key): self.normalize(item) for key, item in value.items()}
        return value

    def build(self):
        original = json.loads((self.audits / "AUD-024-2026-10-08.json").read_text())
        rules = self.read("rule-owners-review.json")
        lifecycle = self.read("lifecycle-review.json")
        mhfe = self.read("mhfe-shared-review.json")
        notes = self.read("coordinator-family-notes.json")
        families = rules["families"]
        replacements = {item["key"]: item for item in notes["families"]}
        families = [dict(item, **replacements.get(item["key"], {})) for item in families]
        assert len(families) == 34 and len({item["key"] for item in families}) == 34
        snapshot = self.read("snapshot.json")
        final_source = self.source()
        manifest = self.read("source-manifest.json")
        baseline = {item["path"]: item["sha256"] for item in manifest}
        final = {item["path"]: item["sha256"] for item in final_source["files"]}
        drift = [name for name in sorted(baseline.keys() | final.keys()) if baseline.get(name) != final.get(name)]
        (self.evidence / "source-final.json").write_text(json.dumps(final_source, indent=2) + "\n")
        snapshot.update({
            "commitComplete": True,
            "finalSourceFingerprint": final_source["fingerprint"],
            "finalSourceFiles": len(final_source["files"]),
            "sourceChangesDuringReview": drift,
            "attribution": "Per-command before/after manifests and per-file review hashes govern conclusions; this was a concurrently changing working tree, not one immutable commit.",
        })
        summaries = {
            "typecheck": "Failed before TypeScript: historical audit links to removed MHFE module.",
            "types-only": "Passed TypeScript compilation only.",
            "mhfe-tabs": "69 passed / 8 files; synthetic MHFE clients, no WASM or KDF.",
            "lifecycle-regressions": "55 passed / 8 files; lifecycle, batching, CSV, BIP85 and module/composition regressions.",
            "mhfe-components": "29 passed / 4 files; cancellation latch, password review, owner prompt and passphrase question.",
            "chosen-controller": "7 passed / 1 file; controller wiring independent of optional checked mode.",
            "bip85-original-probe": "Published 12-word answer passes; original unsupported 13-word request is refused.",
            "csv-original-probe": "Original positive five-byte disabled CSV operand describes no delay.",
            "mhfe-inventory": "31 records, including all 15 nested MHFE files; both Argon2 engines present; wrong manifest pin refused.",
            "late-publication-complete-fixture": "2 expected-contract failures: stale Check match and password-change success after Cancel.",
            "scanner-export-generation": "2 expected-contract failures: old successful/rejected broker reply publishes after another normal scan.",
            "shared-owner-tests": "12 passed / 4 failed, 3 files. Four copy-check fixtures return crash sentinel -1; subprocess EPERM diagnosed separately. No copy-check pass claimed.",
            "subprocess-environment": "Diagnostic succeeded: trivial Node child exit produces spawnSync EPERM; this is an environment gap, not evidence of a tokenizer defect.",
            "check-final": "Failed on the same broken audit link; source unchanged during this command.",
            "late-publication": "Timed out after 90 seconds; initial merge-based config could widen include globs. No completed result accepted. Scoped config replaced the includes and explicit files were used afterward.",
            "late-publication-scoped": "Superseded fixture: stale Check fails; incomplete sealed result made Cancel appear to pass. Complete result fields restored for the accepted reproduction.",
        }
        commands = []
        for path in sorted(self.evidence.glob("*.command.json")):
            name = path.name.removesuffix(".command.json")
            item = json.loads(path.read_text())
            assert hashlib.sha256((self.evidence / f"{name}.log").read_bytes()).hexdigest() == item["logSha256"]
            commands.append(dict(name=name, **item, result=summaries.get(name, "See retained log.")))
        old22 = json.loads((self.audits / "AUD-022-2026-10-06.json").read_text())
        selected = {item["id"]: item for item in old22["findings"]}
        current_findings = []
        for finding_id, observed, evidence, fix in [
            ("AUD-022-UI001", "A fingerprint edited while final walletParameters waits is followed by Matches for the old fingerprint.", "late-publication-complete-fixture: first failed test", "Recheck input revision after final parameters resolve, immediately before result mutation; preserve no-length answer events as job questions."),
            ("AUD-022-API005", "Cancel during the final NewContainerResult.seal metadata wait still leads to Password changed in 0 s. Encode/New wallet have the same shared source path.", "late-publication-complete-fixture: second failed test; independent shared-flow source challenge", "Guard the result lifetime inside seal after its await and before any DOM mutation, invalidate it on reset, and guard caller success. Merely racing the caller with run.step does not revoke seal's internal mutations."),
        ]:
            item = dict(selected[finding_id])
            item.update(status="open", observed=observed, evidence=evidence, recommendedFix=fix,
                        requiredVerification="Replay the bounded real-tab deferred-parameters regression, plus unchanged completion and Cancel/reset variants of Encode/New wallet.",
                        snapshotAttribution="This follow-up; original ID/category/severity retained.",
                        releaseBlocking=False,
                        releaseBlockingReason="Bounded attribution/cancellation defect; no incorrect cipher output or direct key compromise demonstrated. Fix before presenting the affected recovery flow as fully verified.")
            item["reproduction"] = (
                "Run the real Check tab with a synthetic successful check; defer only the final walletParameters request, edit the fingerprint, then resolve parameters."
                if finding_id == "AUD-022-UI001"
                else "Run the real rekey tab with a complete synthetic sealed result; defer only seal's coreParameters request, press its visible Cancel button, then resolve parameters."
            )
            item["affectedSources"] = (
                ["apps/key-derivation/src/ui/recovery-mhfe-check.ts"]
                if finding_id == "AUD-022-UI001"
                else ["apps/key-derivation/src/ui/recovery-mhfe-cards.ts", "apps/key-derivation/src/ui/recovery-mhfe-rekey.ts", "apps/key-derivation/src/ui/recovery-mhfe-encode.ts", "apps/key-derivation/src/ui/recovery-mhfe-new-wallet.ts"]
            )
            item["historicalChecks"] = item.pop("checks", [])
            item["checks"] = ["late-publication-complete-fixture"]
            item["historicalAffectedFiles"] = item.get("affectedFiles")
            item["affectedFiles"] = item["affectedSources"]
            if finding_id == "AUD-022-UI001":
                item["releaseBlocking"] = True
                item["releaseBlockingReason"] = "The current fields can receive a recovery assurance that belongs to an obsolete fingerprint; resolve before publishing the affected Check workflow."
            else:
                item["expected"] = "Cancellation remains latched through final metadata and prevents subsequent card/status publication."
                item["impact"] = "The cancelled recovery operation can still publish a verified card and success for its captured inputs. This reproduction occurs after synthetic cryptographic work completed; it does not demonstrate new KDF work after Cancel, a wrong container or external secret disclosure."
            current_findings.append(item)
        public_export = dict(next(f for f in lifecycle["findings"] if f["id"] == "AUD-024-API004"))
        public_export["evidence"]["executedFollowup"] = "scanner-export-generation: both normal-scan stale reply variants fail the expected contract; integrated Activity coin transition remains source-only."
        current_findings.append(public_export)
        current_findings.append({
            "id": "AUD-027-DOC001", "category": "DOC", "kind": "finding",
            "title": "Historical audit links to a removed source module and stops the project check",
            "severity": "low", "status": "open", "releaseBlocking": True,
            "releaseBlockingReason": "The documented pnpm check cannot complete until the link is corrected; no release execution was requested.",
            "evidence": "typecheck and check-final: identical broken relative Markdown link failure.",
            "reproduction": "Run pnpm check after removal of packages/crypto-core/src/mhfe-wallet-check.ts.",
            "expected": "Historical source evidence retains its hash/path while Markdown links resolve or explicitly describe removed historical paths.",
            "observed": "Error: Broken relative Markdown link in /home/user/Documents/bip_tools/multi-chain-wallet-tools/docs/audits/AUD-024-2026-10-08.md: ../../packages/crypto-core/src/mhfe-wallet-check.ts",
            "impact": "Documentation validation fails before the normal typecheck stage. Separate tsc --noEmit passes. This does not demonstrate a wallet or cryptographic defect.",
            "recommendedFix": "Replace removed-file links with historical plain paths or an exact historical source reference, preserving original reviewed hashes and findings.",
            "requiredVerification": "The relevant link validator and pnpm check pass; do not rewrite historical evidence as newly executed.",
        })
        verified = {
            "AUD-024-SEC001": "lifecycle-regressions: real BIP38 installer with Clear/replacement fixtures",
            "AUD-024-BLD001": "mhfe-inventory plus provenance fixtures; original nested-file EISDIR mechanism corrected; full release-record entry point not run",
            "AUD-024-FUN001": "lifecycle-regressions: actual shared batching owner at 50/51/200; child installer wiring source-traced",
            "AUD-024-FUN002": "csv-original-probe and relative-sequence regressions",
            "AUD-024-API001": "bip85-original-probe and actual BIP85 public API unit tests",
            "AUD-024-API002": "chosen-controller and base feature/controller source trace; stubbed event subscription, no browser/composed artifact",
            "AUD-024-API003": "lifecycle-regressions: real MnemoCode job owner, stale progress/result/error fixtures",
        }
        remediation = []
        for item in original["findings"]:
            identity = item["id"]
            status = "verified" if identity in verified else "fixed" if identity == "AUD-024-DOC001" else "open"
            evidence = verified.get(identity, "Source consolidation is partial; see family register." if "-ARC" in identity else "Source summary now points to chronological index; project-wide link gate still fails on another link." if identity == "AUD-024-DOC001" else "Original public export finding has residual reproduced and source-traced paths.")
            remediation.append(dict(id=identity, title=item["title"], status=status,
                                    fixCommit=None, verificationCommit=None, evidence=evidence,
                                    verificationScope="Uncommitted per-file/source manifests and stated bounded checks; no all-feature/runtime/release claim."))
        remediation += [dict(id=item["id"], status="open", fixCommit=None, verificationCommit=None, evidence=item["evidence"]) for item in current_findings if item["id"].startswith("AUD-022-")]
        remediation.append(dict(id="AUD-023-ARC002", status="deferred", fixCommit=None, verificationCommit=None,
                                evidence="Original owner deferral retained. Upstream ShareRestore now exists, but neither synchronization nor host delegation is complete."))
        coverage = []
        titles = re.findall(r"^### (CHECK-[A-Z]+-\d+) — (.+)$", (self.root / "docs/FULL_AUDIT_GUIDE.md").read_text(), re.M)
        performed = {
            "CHECK-SEC-005": ("passed", "BIP38 publication and selected recovery lifecycle fixtures pass; immutable-string erasure and complete exceptional paths not proven."),
            "CHECK-FUN-002": ("passed", "Child batching 50/51/200 passes; actual coin/address known answers not freshly recalculated."),
            "CHECK-FUN-003": ("passed", "BIP85 known answer/runtime refusal and BIP38 UI fixtures pass; real BIP38 KDF/messages/Silent Payments not rerun."),
            "CHECK-FUN-004": ("passed", "Disabled CSV original regression passes; complete consensus/script/descriptor suite not run."),
            "CHECK-API-001": ("passed", "Selected MHFE/MnemoCode binding source and BIP85 runtime domain checked; not every API contract executed."),
            "CHECK-API-002": ("failed", "AUD-022-UI001, AUD-022-API005 and AUD-024-API004 residual ordering failures reproduced."),
            "CHECK-API-003": ("failed", "Scanner stale feedback reproduced; integrated Activity cross-owner workbook path source-only; monetary fidelity not replayed."),
            "CHECK-BLD-001": ("passed", "Bounded selective composition/module-boundary tests pass; no artifact or full build matrix."),
            "CHECK-BLD-003": ("passed", "15 MHFE inventory files verified through actual manifest owner; 143 MnemoCode manifest hashes match; current upstream has 6 changed files and unadopted ShareRestore. No released-upstream/all-license certification."),
            "CHECK-UI-002": ("failed", "Synthetic real-tab event ordering defects reproduced; no actual browser viewport/navigation execution."),
            "CHECK-ARC-001": ("failed", "Some owners consolidated; all four original rule-ownership findings remain partial/open."),
            "CHECK-ARC-002": ("failed", "34 original families reclassified; semantic duplicates remain. Copy-detector fixtures have a subprocess EPERM gap."),
            "CHECK-ARC-003": ("failed", "New targeted regressions pass but final metadata waits are uncovered by them; inactive generated-entry metadata assertions remain."),
            "CHECK-DOC-001": ("passed", "Original stale-latest statement corrected; documentation/cryptographic guarantee parity sampled only."),
            "CHECK-DOC-002": ("failed", "pnpm check fails on removed-source audit link; standalone tsc succeeds."),
            "CHECK-DOC-003": ("passed", "Paired record, procedure hashes, evidence log hashes, original IDs and privacy are validated locally."),
        }
        for identity, title in titles:
            outcome, detail = performed.get(identity, ("not-run", "Outside this bounded remediation execution; no complete runtime/security/vector/browser/build/release proof. Applicable scope remains a gap, not not-applicable."))
            coverage.append(dict(checkId=identity, title=title, primaryOwner="Coordinator plus scoped reviewers", outcome=outcome, evidenceAndGap=detail))
        assert len(coverage) == 32
        now = datetime.datetime.now(datetime.UTC).isoformat()
        record = {
            "schemaVersion": 1, "auditId": "AUD-027", "auditNumber": 27, "date": now[:10],
            "title": "Wallet tools remediation verification and remaining rule ownership",
            "reviewer": {"name": "Codex coordinator and three scoped source reviewers", "model": None, "reasoningEffort": None},
            "reviewerPhases": [{"name": name, "scope": scope, "model": None, "reasoningEffort": None} for name, scope in [("Lorentz", "Original semantic duplication owners and tooling/docs"), ("Schrodinger", "Lifecycle regressions and MnemoCode sync"), ("Russell", "MHFE shared flows and independent late-seal challenge")]],
            "completedAtUtc": now, "snapshot": snapshot,
            "procedure": [{"path": path, "sha256": digest} for path, digest in self.read("procedure-hashes.json").items()],
            "scope": "Read-only verification of Claude's current AUD-024 remediation and MHFE/MnemoCode integration; product code untouched, no commit/release authorization. MHFE and MnemoCode upstream checkouts read only. Dash emitted artifacts not rebuilt or verified.",
            "checks": {"commands": commands, "coverage": coverage, "acceptedTestTotals": {"repositoryPassed": 172, "repositoryEnvironmentFailures": 4, "auditContractFailures": 4}, "countLimit": "Counts exclude the timed-out broad-config attempt and superseded incomplete fixture; no failed assertion was relaxed."},
            "findings": current_findings, "observations": [], "remediation": remediation,
            "duplicationRegister": {"families": families, "summary": dict(collections.Counter(item["status"] for item in families)), "countLimit": "34 original inspected semantic families, not a fresh repository-wide clone count. No facets/locations are summed into a global extra-copy total."},
            "mnemocodeSync": {key: lifecycle["mnemocodeSync"][key] for key in ["manifestMetadata", "listedFileCount", "manifestHashMatches", "upstreamByteMatches", "mismatches", "additionalUpstreamApi"]},
            "mhfeSupportedContracts": mhfe["supportedContracts"],
            "unexecutedSourceFollowups": [item for item in mhfe["sourceGaps"] if item["key"] != "common-seal-late-publication"],
            "sourceBindings": {"ruleOwners": rules["referencedSources"], "lifecycle": lifecycle["sourceBindings"], "mhfe": mhfe["sourceHashes"], "coordinator": [binding for item in notes["families"] for binding in item["sourceBindings"]]},
            "limitations": [
                "Review depth is source inspection plus bounded regressions, not independent security certification, complete cryptographic correctness or release readiness.",
                "No deliberate release/full-vector/KDF/browser/Docker/native/WASM/PDF-rendering procedure was requested. Initial merged harness configuration could widen test selection; it timed out at 90 seconds with only the Vitest banner retained, was interrupted, and no outcome is accepted from it. Exact one-file scoped reruns replaced it.",
                "Node heap ceiling 1536 MiB, one test worker, checks sequential. Memory sample: 7961620480 bytes used, 7857393664 bytes available. No continuous global peak guarantee across other sessions.",
                "Source changed concurrently. Command records bind stable intervals; whole-review baseline and final fingerprints differ. Historical audit metadata also changed externally; no retrospective rerun of old evidence is implied.",
                "Four copy-check test failures are not confirmed product defects: a trivial child subprocess also produces EPERM in this execution environment.",
                "The first scoped Rekey fixture omitted result fields and misleadingly passed after a rendering error; it was corrected, and only the complete-fixture failure is accepted.",
                "Seven AUD-024 findings have bounded regression verification; DOC001 is source-fixed; six remain open/partial. No signed remediation commits exist for this follow-up; exact source hashes substitute for commit identity.",
                "Actual frontend versus native cryptographic equality, randomness distributions, all error paths, runtime secret erasure, fast-mode performance and emitted artifacts are not established by synthetic clients or source hashes.",
                "No production edits, other-project edits, commits, pushes, tags, releases, remote CI or messages were performed by this review.",
                "Exact model snapshot and reasoning setting are unavailable; user UI labels are not substituted for execution metadata.",
            ],
        }
        return self.normalize(record)

    def publish(self):
        record = self.build()
        filename = f"AUD-027-{record['date']}"
        destination = self.audits / f"{filename}.json"
        if destination.exists():
            raise SystemExit("Do not overwrite a completed report; use explicit follow-up evidence.")
        destination.write_text(json.dumps(record, indent=2) + "\n")
        text = [f"# AUD-027 — {record['title']}", "", "## Record metadata", "",
                f"- **Completed (UTC):** {record['completedAtUtc']}.",
                "- **Reviewer:** Codex coordinator and three scoped source reviewers; exact model and reasoning effort unknown.",
                f"- **Reviewed HEAD:** `{record['snapshot']['commit']}`; pre-existing dirty checkout, edited concurrently by other work.",
                f"- **Initial source fingerprint:** `{record['snapshot']['sourceFingerprint']}`.",
                f"- **Final source fingerprint:** `{record['snapshot']['finalSourceFingerprint']}`.",
                "- **Artifacts:** Not rebuilt or reviewed. No product edits or commits by this review.",
                "", "## Finding register", "",
                "| Finding ID | Category | Severity | Status | Release blocking | Title |",
                "| --- | --- | --- | --- | --- | --- |"]
        for item in record["findings"]:
            text.append(f"| {item['id']} | {item['category']} | {item['severity']} | {item['status']} | {item['releaseBlocking']} | {item['title']} |")
        text += ["", "## Review evidence", "", "### Scope and methodology", "", record["scope"], "",
                 "Seven original AUD-024 findings pass their stated bounded checks, one documentation finding is source-fixed, and six remain open or partial. Two earlier MHFE IDs remain open at the newly reproduced final-metadata boundaries. There is no evidence here of an incorrect cipher result or direct key compromise.", "",
                 "The coordinator executed every accepted command. Scoped reviewers read source only. A separate MHFE reviewer challenged cancellation reachability: parameters uses a quick worker outside the long-operation slot, while Cancel remains visible. Wrapping only the caller's seal promise cannot revoke mutation inside seal.", "",
                 "### Procedure hashes", "", "| File | SHA-256 |", "| --- | --- |"]
        for item in record["procedure"]:
            text.append(f"| `{item['path']}` | `{item['sha256']}` |")
        text += ["", "### Coverage ledger", "", "Passed means only the stated bounded scope; the remaining gap is part of every row.", "",
                 "| Check ID | Group | Outcome | Evidence / remaining gap |", "| --- | --- | --- | --- |"]
        for item in record["checks"]["coverage"]:
            text.append(f"| {item['checkId']} | {item['title']} | {item['outcome']} | {item['evidenceAndGap']} |")
        text += ["", "### Checks", "", "Local-only command records retain exact argv, UTC intervals, exit status, log hashes and source-before/source-after manifests. All captured completed commands have stable source during their interval; this does not make the entire review immutable.", "",
                 "| Record | Exit | Command | Result | Log SHA-256 |", "| --- | --- | --- | --- | --- |"]
        for item in record["checks"]["commands"]:
            command = " ".join(item["command"]).replace("|", "\\|")
            text.append(f"| `{item['name']}` | {item['exitCode']} | `{command}` | {item['result']} | `{item['logSha256']}` |")
        text += ["", "Accepted distinct repository checks: 172 passed, four copy-check fixtures failed with the separately diagnosed subprocess restriction; four audit contract assertions failed. The timeout and superseded fixture are excluded from these counts.", "",
                 "### Findings", ""]
        for item in record["findings"]:
            text += [f"#### {item['id']} — {item['severity'].capitalize()} — {item['title']}", ""]
            for label, key in [("Category", "category"), ("Status", "status"), ("Release blocking", "releaseBlocking"), ("Reproduction", "reproduction"), ("Expected", "expected"), ("Observed", "observed"), ("Impact and limitations", "impact"), ("Evidence", "evidence"), ("Recommended fix", "recommendedFix"), ("Required verification", "requiredVerification")]:
                value = item[key]
                if not isinstance(value, (str, bool)):
                    value = json.dumps(value, ensure_ascii=True)
                text.append(f"- **{label}:** {value}")
            text.append("")
        text += ["### Remediation and follow-up", "", "No new finding IDs replace earlier IDs. Statuses apply to this follow-up's source hashes and stated checks; fix and verification commit identities are not yet available.", "",
                 "| Finding ID | Status | Fix commit | Verification commit | Evidence / bound |", "| --- | --- | --- | --- | --- |"]
        for item in record["remediation"]:
            value = item["evidence"] if isinstance(item["evidence"], str) else json.dumps(item["evidence"])
            text.append(f"| {item['id']} | {item['status']} | Uncommitted | Source manifests | {value} |")
        text += ["", "### Original semantic duplication families", "", f"Disposition counts: `{json.dumps(record['duplicationRegister']['summary'], sort_keys=True)}`. Source-consolidated means one inspected owner, not verified runtime equivalence. These are the original 34 families; no repository-total duplicate count is claimed.", "",
                 "| Family / original finding | Current source disposition | Owner | Remaining definitions / qualification |", "| --- | --- | --- | --- |"]
        for item in record["duplicationRegister"]["families"]:
            residual = "; ".join(item["residualDefinitions"]) or item.get("limit", "No residual definition in the original inspected sites; runtime scope remains bounded.")
            text.append(f"| `{item['key']}` / {item['findingId']} | {item['status']} | `{item['owner']}` | {residual.replace('|', '/')} |")
        text += ["", "### MHFE and MnemoCode correspondence", "",
                 "MHFE Check and rekey delegate canonical container facts, detection and checks to the package. Zero words requests detection; the no-length question is a job answer, not an edit. Rekey handles AMBIGUOUS_LENGTH by asking for another choice. The shared cards/task/password/length helpers remove meaningful copies, while final publication and some static limits still have separate owners.", "",
                 "Both MHFE Argon2 files remain in the manifest and inventory; fast-mode selection remains in the engine. No real Argon2 or native/browser parity run is attributed to this audit. Checked generation delegates assessment to MhfeWallet.describeDraw and checks the generated phrase in a fresh worker; that is not an independent cryptographic implementation.", "",
                 "MnemoCode: 143/143 manifest-listed files match their declared hashes; 137/143 match the current upstream checkout. Six changes are coin/self-test/coin-injection API refactors. The manifest explicitly describes an unreleased working tree. Current host calls match the current vendored API; complete latest-upstream adoption is not claimed. Upstream ShareRestore exists but is not vendored or delegated by MnemoCodeShares; AUD-023-ARC002 remains deferred.", "",
                 "### Unexecuted focused follow-ups", ""]
        for item in record["unexecutedSourceFollowups"]:
            text += [f"- **{item['key']}:** {item['observed']} {item['limit']}"]
        text += ["", "These source leads are kept separate from the accepted reproduced defects. Required next evidence and exact sites are in the JSON companion. They do not establish a cryptographic authentication bypass.", "",
                 "### Assessment and limitations", ""]
        for item in record["limitations"]:
            text.append(f"- {item}")
        text += ["", "Fix ordering: close the two MHFE publication boundaries and normal-scan export generation; correct the historical broken links; adopt ShareRestore with the MnemoCode owner; then consolidate the remaining protocol/parameter/catalog owners with their nearest regressions. Do not create generic classes across private and public trust realms or move pure calculations into one-method objects.", ""]
        (self.audits / f"{filename}.md").write_text(self.normalize("\n".join(text)))
        print(destination.name)


if __name__ == "__main__":
    FollowupReport().publish()
