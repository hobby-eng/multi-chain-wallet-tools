"""Append the authorized fixes, preserving the original review and command evidence."""

import datetime
import json
import pathlib
import re
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "AUD-027-harnesses"))
from append_remediation import digest, public
from capture import ReviewCommand


# Each original finding has one disposition. A gap keeps it fixed, rather than verified.
DETAILS = [
    ("SEC001", "InputRevision/MhfeTask/MhfeRun revoke pending draws after input and change events; the delayed public-vector browser case is registered in both editions and engines, with encryption refused before Argon2.", "apps/key-derivation/src/ui/recovery-mhfe-task.ts", ["remediation-product-lifecycle", "remediation-browser-case-syntax"], ["The new browser case was written and syntax-checked, not executed."]),
    ("SEC002", "The egress tripwire recognizes original and normalized embedded UTF-8 Base64/Base64URL, padded or unpadded, percent-encoded cells despite malformed escapes elsewhere, and case-insensitive byte hex. Temporary UTF-8 bytes are wiped; public false-positive and malformed-surrogate tests pass.", "packages/secret-boundary/src/secret-guard.ts", ["remediation-product-complete", "remediation-unicode-transport-final"], []),
    ("FUN001", "The recovery-branch script template delegates CLTV/CSV admission and rendering to the existing lock objects, including negative, disabled, block/time and five-byte operands.", "apps/psbt-inspector/src/script.ts", ["remediation-product-complete", "remediation-shared-ui-fixed"], []),
    ("FUN002", "Platform replies must contain each requested storage key exactly once, including explicit null proved absence; missing, extra and duplicate entries fail before use in seed, xpub or exact-key callers. Synthetic fixture replies now retain all requested keys.", "apps/discovery-scanner/src/coins/dash/platform-scanner.ts", ["remediation-product-complete", "remediation-watch-fixtures-fixed"], ["No live SDK/provider smoke request was made."]),
    ("FUN003", "AddressGapTracker caps extension at the configured maximum and reports truncation; Bitcoin/Ethereum/Dash seed sections expose partial coverage instead of an out-of-range tail.", "apps/discovery-scanner/src/address-gap.ts", ["remediation-product-complete"], ["High-account and near-limit cases were not individually replayed through all three full seed scanners."]),
    ("FUN004", "Empty PUSHDATA operands render as 0; empty and four-byte push assembly regressions pass.", "apps/psbt-inspector/src/script.ts", ["remediation-product-complete"], []),
    ("API001", "Derivation-control edits cancel a pending checked draw, clear its progress and prevent late publication; the controller's deferred-engine regression passes.", "apps/key-derivation/src/ui/controller.ts", ["remediation-product-lifecycle"], ["The two-engine browser draw probe was not executed."]),
    ("API002", "A transport/worker failure permits an explicit retry; a genuine failed cryptographic startup check keeps the checked mode closed. Both branches and the successful retry are tested.", "apps/key-derivation/src/ui/checked-mnemonic-feature.ts", ["remediation-product-lifecycle"], []),
    ("BLD001", "ScanSecrets is seed-free; SeedScanSecrets owns and wipes the seed through composition. Four actual watch-only builds exclude seed derivation through their composition gates.", "apps/discovery-scanner/src/seed-scan-secrets.ts", ["remediation-product-complete"], ["The full 70-job selective matrix and browser watch-only suite were not run."]),
    ("BLD002", "The regression suite's recovery-help count matches the new chosen-word explanation and its owner comment.", "tooling/verify-browser-regressions.mjs", ["remediation-browser-case-syntax"], ["Browser regressions were not executed."]),
    ("BLD003", "Manifest writes require the canonical container marker and container execution; the real host --write command refuses without altering the manifest. Existing source-drift refusal remains active.", "tooling/verify-wasm-integrity.mjs", ["remediation-manifest-refusal", "remediation-tool-final-fixed", "remediation-container-config"], ["Canonical WASM regeneration and the Docker source/binary comparison remain release work."]),
    ("BLD004", "The global Dash gate rejects Silent Payments/BIP352 outside the Inspector's bounded unsupported-decoder allowance. Pure network-table construction also removes unused Bitcoin labels from Dash bundles; the allowance was not widened.", "tooling/verify-dash-community-artifacts.mjs", ["remediation-tool-final-fixed", "remediation-dash-gate-handoff"], []),
    ("BLD005", "Push/PR CI runs bounded source checks; canonical, browser, full-WASM and vector jobs are manual. Release instructions retain the owner's release-only long-check rule.", ".github/workflows/ci.yml", ["remediation-tool-final-fixed"], []),
    ("BLD006", "Every artifact verifier checks reviewed dynamic-code counts. Added bare, qualified, bracket, optional and indirect calls are refused by mutants; all eight current artifacts pass.", "tooling/artifact-checks.mjs", ["remediation-tool-final-fixed"], []),
    ("BLD007", "MhfeIntegrationModules owns the complete integration inventory, including checked generation; composition and provenance import it.", "tooling/mhfe-integration.mjs", ["remediation-tool-contracts", "remediation-provenance-local"], []),
    ("UI001", "Only warning banners with an icon use the two-column grid. Inline notes, status messages and chosen-word warnings use ordinary flow.", "packages/shared-ui/styles/main.css", ["remediation-tool-final-fixed"], ["The 24 browser layout checks were not run."]),
    ("UI002", "ToolProtocolFooter renders selected coin protocols from one owner in Deriver, Inspector and Scanner. Single-coin contracts and current artifact markers pass.", "tooling/tool-protocol-footer.mjs", ["remediation-tool-contracts"], []),
    ("UI003", "Bip39WordReader owns complete-word, trim/case, unique four-character-prefix and refusal rules; fields and generation agree. Commas and multiple words are refused without truncating input.", "packages/crypto-core/src/bip39-word-reader.ts", ["remediation-product-complete"], ["The browser field-validity probe was not run."]),
    ("DOC001", "The MHFE package README truthfully identifies the unreleased local 0.5.1 build and its exact build ID/manifest; other documentation points to this provenance owner. Release refusal remains active.", "packages/recovery-mhfe-wasm/README.md", ["remediation-provenance-local", "remediation-check-sealed"], []),
    ("DOC002", "Both draft notes describe one chosen word, one excluded word, checked generation with the confirmed nonempty BIP39 passphrase, the full-seed hash criterion and the help control. The changelog labels v0.1.5 in preparation.", "docs/releases/v0.1.5.md", ["remediation-check-sealed"], []),
    ("DOC003", "Dead AUD-024 source hyperlinks are historical code labels; the link and metadata gate passes. Old findings, command results and source hashes were not replaced.", "docs/audits/AUD-024-2026-10-08.md", ["remediation-check-sealed"], []),
    ("DOC004", "README and SECURITY distinguish CSP connection/subresource controls from top-level navigation and popups; they no longer claim CSP blocks the latter.", "SECURITY.md", ["remediation-check-sealed"], []),
    ("ARC001", "The chosen-word search is documented as synchronous; dead AbortController plumbing is removed. Publication still checks the input revision, with a changed-input regression after computation.", "apps/key-derivation/src/ui/chosen-words-feature.ts", ["remediation-product-lifecycle", "remediation-core-final"], []),
    ("ARC002", "Public input and mnemonic-entry parsing import the shared BIP39 word-count owner; their acceptance/refusal tests pass.", "packages/secret-boundary/src/public-input-guard.ts", ["remediation-product-complete"], []),
    ("ARC003", "DescriptorFragmentCatalog owns context-specific membership and hashlock names; parsers, policy, compiler and walkers delegate to it. Descriptor/policy regressions and the original repeated-list contract pass.", "apps/psbt-inspector/src/descriptor-fragments.ts", ["remediation-shared-ui-fixed", "remediation-repeated-lists-handoff"], []),
    ("ARC004", "Scanner shell and the ordinary exporter use one downloadBlob owner; the helper is dependency-free, uses noopener and one size refusal, and the vault download ban is preserved.", "packages/export-core/src/download.ts", ["remediation-tool-contracts", "remediation-semantic-rest"], []),
    ("ARC005", "MHFE self-check part/failure messages and progress callbacks have shared owners; all tabs delegate while preserving failed-check closure and current-run publication.", "apps/key-derivation/src/ui/recovery-mhfe-status.ts", ["remediation-shared-ui-fixed"], []),
    ("ARC006", "englishList owns and/or joining and the Oxford comma; MHFE status and build metadata delegate. Exact message expectations were updated only for this intended punctuation change.", "packages/crypto-core/src/listing.ts", ["remediation-tool-final-fixed", "remediation-shared-ui-fixed"], []),
    ("ARC007", "Vitest aliases derive from TypeScript paths, preserving generated .js extensions; only the documented btcutil test stub overrides one path.", "vitest.config.ts", ["remediation-tool-contracts", "remediation-check-sealed"], []),
    ("ARC008", "pnpm check runs the first-party copy detector; Rust test modules are excluded without dropping later production code. Shared Rust scan bindings preserve their ABI and wipe copied keys on refusal; worker disposal and input lifetime handling delegate to common owners.", "tooling/verify-no-copies.mjs", ["remediation-tool-contracts", "remediation-rust-key-boundary", "remediation-check-sealed"], []),
    ("ARC009", "Inspector pasted-line parsing delegates to nonEmptyLines rather than seven private split/trim/filter copies; nearest policy-input tests pass.", "apps/psbt-inspector/src/policy-builder-feature.ts", ["remediation-shared-ui-fixed"], []),
    ("ARC010", "Launcher builds use the existing Rust toolchain resolver; resolver and workflow contracts and the affected bounded native Rust test pass.", "tooling/build-key-derivation-launchers.mjs", ["remediation-tool-final-fixed", "remediation-rust-key-boundary"], ["Native launcher executables were not rebuilt."]),
]

LIMITATIONS = [
    "This appended remediation retains the original audit, findings, source bindings and failed evidence. It is not a new full audit or a release verification.",
    "Five helpers reached account limits; the coordinator completed integration and bounded verification. No independent final specialist review is claimed.",
    "No browser execution, full vector replay, full-size Argon2/scrypt, card/PDF generation, Docker/WASM/native launcher build, live provider request or remote CI was performed during remediation. One startup SLIP-39 known answer plus its small round trip and checksum refusal were run after deriving its round order.",
    "Node heap was limited to 1536 MiB and tests to one worker. Each HTML series ran serially; the final default and watch-only series overlapped for part of their tail. Available-memory samples remained above 6 GiB, but no continuous host-wide peak guarantee is made for other sessions. No Docker or full-size KDF ran.",
    "The eight default pages and four watch-only samples are ignored local HTML outputs using committed WASM. There is no full selective matrix, browser equivalence, canonical reproducibility or release certification.",
    "The canonical manifest correctly refuses the changed Rust/build source. Do not rewrite it on the host to obtain a pass; regenerate/compare WASM only in the requested canonical release procedure.",
    "MHFE and MnemoCode remain explicitly unreleased upstream copies. Their release gates are retained; local HTML success does not authorize shipping them.",
    "Dynamic-code checks are lexical reviewed-count guards, not a complete JavaScript alias-analysis proof. CSP still omits unsafe-eval.",
    "The repeated-list and 50-token copy detectors cover their stated syntactic scope; zero detected copies is not proof that all semantic duplication is absent.",
    "No commit, push, tag or release was made. Other repositories were not edited.",
]


class RemediationRecord:
    """Own one append-only phase and its local source manifest."""

    def __init__(self):
        self.recorder = ReviewCommand("remediation-report", [], audit_number=26)
        self.root = self.recorder.root
        self.evidence = self.recorder.evidence
        self.report = self.root / "docs/audits/AUD-026-2026-10-09.json"
        self.markdown = self.report.with_suffix(".md")

    def commands(self):
        commands = []
        for path in sorted(self.evidence.glob("remediation-*.command.json")):
            entry = json.loads(path.read_text())
            name = path.name.removesuffix(".command.json")
            log = self.evidence / f"{name}.log"
            assert digest(log) == entry["logSha256"], name
            text = re.sub(r"\x1b\[[0-9;]*m", "", log.read_text())
            summary = re.findall(r"(?:Test Files|Tests)\s+([^\n]+)", text)
            commands.append({"name": name, **public(entry), "recordSha256": digest(path),
                             "summary": summary, "localEvidence": True})
        return commands

    def artifacts(self, commands):
        artifacts = {}
        for item in commands:
            if item["exitCode"] != 0:
                continue
            text = (self.evidence / f"{item['name']}.log").read_text()
            match = re.search(r"Built ([^\n]+) \(([\d,]+) bytes\)\nSHA-256 ([0-9a-f]{64})", text)
            if match is None:
                continue
            name, size, sha = match.groups()
            path = pathlib.Path(name)
            path = path if path.is_absolute() else self.root / path
            if path.is_file() and digest(path) == sha:
                relative = path.relative_to(self.root).as_posix()
                artifacts[relative] = {"path": relative, "bytes": int(size.replace(",", "")),
                                       "sha256": sha, "command": item["name"],
                                       "localIgnoredOutput": True}
        assert len(artifacts) == 12
        return list(artifacts.values())

    def run(self):
        report = json.loads(self.report.read_text())
        if "authorizedRemediation" in report:
            raise SystemExit("A phase already exists; original evidence must not be overwritten.")
        original_json = self.evidence / "remediation-original-report.json"
        original_md = self.evidence / "remediation-original-report.md"
        rebinding = None
        if self.report.read_bytes() != original_json.read_bytes():
            original = json.loads(original_json.read_text())
            old = next(item for item in original["findings"] if item["id"] == "AUD-026-DOC001")
            new = next(item for item in report["findings"] if item["id"] == old["id"])
            pattern = r"a local build of mhfe commit ([0-9a-f]{7})"
            old_ref = re.search(pattern, old["affected"]).group(1)
            new_ref = re.search(pattern, new["affected"]).group(1)
            old_text, new_text = old["affected"], new["affected"]
            assert old_text.replace(old_ref, new_ref) == new_text
            old["affected"] = new_text
            assert original == report, "Only the concurrent upstream reference rebinding is admitted"
            assert original_md.read_bytes().replace(
                f"mhfe commit {old_ref}".encode(), f"mhfe commit {new_ref}".encode()
            ) == self.markdown.read_bytes()
            rebinding = {"findingId": old["id"], "field": "affected",
                         "oldReference": old_ref, "newReference": new_ref,
                         "before": old_text, "after": new_text,
                         "earliestReportSha256": digest(original_json),
                         "earliestMarkdownSha256": digest(original_md),
                         "reason": "Concurrent upstream commit-reference rebinding; all other historical fields and original local evidence remain unchanged."}
            original_json = self.evidence / "remediation-rebound-original-report.json"
            original_md = self.evidence / "remediation-rebound-original-report.md"
            for retained, current in [(original_json, self.report), (original_md, self.markdown)]:
                if retained.exists():
                    assert retained.read_bytes() == current.read_bytes()
                else:
                    retained.write_bytes(current.read_bytes())
        assert self.report.read_bytes() == original_json.read_bytes()
        assert self.markdown.read_bytes() == original_md.read_bytes()
        baseline = json.loads((self.evidence / "remediation-baseline.json").read_text())
        source = self.recorder.source()
        before = {item["path"]: item["sha256"] for item in baseline["files"]}
        changed = [item for item in source["files"] if before.get(item["path"]) != item["sha256"]]
        removed = sorted(set(before) - {item["path"] for item in source["files"]})
        commands = self.commands()
        by_name = {item["name"]: item for item in commands}
        now = datetime.datetime.now(datetime.UTC).isoformat()
        dispositions = []
        for suffix, correction, owner, checks, gaps in DETAILS:
            assert (self.root / owner).is_file(), owner
            assert all(by_name[name]["exitCode"] == 0 for name in checks), suffix
            dispositions.append({"id": f"AUD-026-{suffix}",
                                 "status": "fixed" if gaps else "verified",
                                 "fixCommit": None, "verificationCommit": None,
                                 "recordedAtUtc": now, "phase": "authorized-remediation",
                                 "sourceFingerprint": source["fingerprint"],
                                 "owner": owner, "ownerSha256": digest(self.root / owner),
                                 "evidence": correction, "acceptedCommands": checks,
                                 "verificationGaps": gaps,
                                 "verificationScope": "Stated bounded regression/static contracts; release gaps remain explicit."})
        assert {item["id"] for item in dispositions} == {item["id"] for item in report["findings"]}
        final_checks = ["remediation-product-complete", "remediation-watch-fixtures-fixed",
                        "remediation-repeated-lists-handoff", "remediation-format-sealed",
                        "remediation-check-sealed", "remediation-dash-gate-handoff"]
        final_checks += ["remediation-semantic-rest", "remediation-watch-depths-final", "remediation-unicode-transport-final"]
        final_checks += [item["name"] for item in commands if item["name"].startswith("remediation-sealed-")]
        assert all(by_name[name]["exitCode"] == 0 for name in final_checks)
        list_scan = json.loads((self.evidence / "remediation-repeated-lists-handoff.json").read_text())
        assert list_scan["repeatedGroups"] == 0 and list_scan["contractPassed"]
        phase = {"completedAtUtc": now,
                 "authorization": "The owner requested all findings fixed and resumed the work; no commit/publication authorization.",
                 "reviewer": {"name": "Codex coordinator", "model": None, "reasoningEffort": None},
                 "actualHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root).decode().strip(),
                 "baselineSourceFingerprint": baseline["sourceFingerprint"],
                 "sourceFingerprint": source["fingerprint"], "sourceFileCount": len(source["files"]),
                 "changedSources": changed, "removedSources": removed,
                 "originalReportSha256": digest(original_json), "originalMarkdownSha256": digest(original_md),
                 "reportBaseline": {"json": original_json.name, "markdown": original_md.name},
                 "historicalMetadataRebinding": rebinding,
                 "procedure": {name: digest(self.root / name) for name in report["procedure"]},
                 "harnessHashes": {
                     path.relative_to(self.root).as_posix(): digest(path)
                     for path in sorted((self.root / "docs/audits/AUD-026-harnesses").iterdir())
                     if path.is_file()
                 },
                 "sharedHarnessHashes": {
                     name: digest(self.root / name)
                     for name in ["docs/audits/AUD-027-harnesses/capture.py",
                                  "docs/audits/AUD-027-harnesses/append_remediation.py"]
                 },
                 "commands": commands, "acceptedCommands": final_checks,
                 "dispositions": dispositions, "artifacts": self.artifacts(commands),
                 "historicalFollowup": {"auditId": "AUD-027", "report": "docs/audits/AUD-027-2026-10-08.json",
                                        "sourceFingerprint": baseline["sourceFingerprint"],
                                        "scope": "The earlier consolidation phase remains historical; these later fixes supersede its local HTML."},
                 "additionalConsolidation": [
                     "RecoverySectionGroups owns Core/addressable/history/derivation/credit membership for CSV, summaries and tabs.",
                     "Recovery history date fields, identity-creation action/type pairs, Dash P2PKH address/signing families, multisig private-field labels and watch-only xpub depths each have one owner.",
                     "Matcher display/TSV headers, PDF identity matrices and SLIP-39 forward/reverse round order are derived or defined once. No PDF/card test was executed.",
                     f"The original repeated-list scan now reports zero repeated groups in {list_scan['files']} production TypeScript files; context-specific fragment sets remain distinct.",
                 ],
                 "sourceDrift": "A concurrent edit of the audit guide was observed during one check; its bytes are included in the final manifest. Product edits and formatting intervals retain before/after manifests.",
                 "limitations": LIMITATIONS,
                 "remainingReleaseBlockers": ["Canonical source/WASM comparison pending.",
                                              "MHFE and MnemoCode copies are unreleased; existing publication gates remain.",
                                              "Required browser/complete selective acceptance is unexecuted."]}
        report["authorizedRemediation"] = phase
        report["remediation"].extend(dispositions)
        fragment = self.render(phase)
        formatted = subprocess.check_output(["pnpm", "exec", "prettier", "--stdin-filepath", str(self.markdown)],
                                            input=fragment.encode(), cwd=self.root)
        self.report.write_text(json.dumps(public(report), indent=2) + "\n")
        self.markdown.write_bytes(original_md.read_bytes() + b"\n" + formatted)
        (self.evidence / "remediation-source-final.json").write_text(json.dumps(source, indent=2) + "\n")
        print(json.dumps({"dispositions": len(dispositions), "verified": sum(not item["verificationGaps"] for item in dispositions),
                          "fixedWithGaps": sum(bool(item["verificationGaps"]) for item in dispositions),
                          "sourceFingerprint": source["fingerprint"], "artifacts": 12}))

    def render(self, phase):
        lines = ["## Authorized remediation — " + phase["completedAtUtc"], "",
                 "The owner asked for all findings corrected. This later phase preserves every original finding, check, failure and reviewed snapshot above. All 32 findings have an implementation or documentation correction. A row stays `fixed` where its required runtime/release acceptance has not been run; a bounded pass alone is not a claim of release readiness.", "",
                 f"The primary checkout remains uncommitted at HEAD `{phase['actualHead']}`. Before/after first-party source fingerprints: `{phase['baselineSourceFingerprint']}` → `{phase['sourceFingerprint']}` ({phase['sourceFileCount']} files, {len(phase['changedSources'])} changed and {len(phase['removedSources'])} removed since the remediation baseline). The JSON records each changed source hash, original report hashes, procedure hashes and exact command evidence. No commit identity is fabricated.", "",
                 "### Corrections and acceptance gaps", "",
                 "| Finding | Current disposition | Correction and owner | Remaining verification |",
                 "| --- | --- | --- | --- |"]
        for item in phase["dispositions"]:
            owner = pathlib.Path("../..") / item["owner"]
            gaps = " ".join(item["verificationGaps"]) or "Stated bounded checks passed."
            lines.append(f"| {item['id']} | {item['status']} | {item['evidence']} [{item['owner']}]({owner.as_posix()}) | {gaps} |")
        lines += ["", "The chosen-word search's old probe assumes an asynchronous abortable search. That contract was removed and documented as synchronous; a pending-publication input-revision regression is its replacement. Original probe failures remain in the historical evidence.", "",
                  "### Further shared owners", ""]
        if phase["historicalMetadataRebinding"]:
            change = phase["historicalMetadataRebinding"]
            lines += [f"A concurrent upstream reference rebinding changed only AUD-026-DOC001's quoted commit prefix `{change['oldReference']}` to `{change['newReference']}` before this append. Both original report states are retained with their hashes. No finding, old result or source evidence was rerun or silently replaced by that metadata edit.", ""]
        lines.extend(f"- {item}" for item in phase["additionalConsolidation"])
        lines += ["", "### Executed checks", "",
                  "Every remediation command, including intermediate failures, is retained in the JSON with UTC times, exit codes, log/record hashes and before/after source manifests. Run-level test counts overlap and must not be added into a total. The accepted groups include 39 product tests, 23 lifecycle tests, 55 tooling tests, 138 shared UI/Inspector tests, 24 core tests and 15 final tool tests. A later 95-test group had 93 passes and two obsolete Platform fixtures; the corrected 34-test watch-only file and the remaining 61 tests pass separately. The final depth-profile move has its own two-file rerun. One native Rust helper test passed with 13 tests filtered out.", "",
                  "The fixture corrections preserve the strict assertions: explicit proved absence replaces omitted Platform keys; the spelling fixture calls the actual assessment method; exact English message expectations change only the intended shared punctuation. Type errors and the actual Dash network-label leak were fixed in source. No public vector was deleted or assertion relaxed.", "",
                  "| Final command record | Exit | Log SHA-256 |", "| --- | --- | --- |"]
        by_name = {item["name"]: item for item in phase["commands"]}
        for name in phase["acceptedCommands"]:
            item = by_name[name]
            lines.append(f"| `{name}` | {item['exitCode']} | `{item['logSha256']}` |")
        lines += ["", "### Current local HTML", "",
                  "Eight default pages and four watch-only samples passed their composition gates; each series was serial, with the final two series partially overlapping. Each default artifact verifier and the global Dash exclusion gate passed. These files are ignored local outputs, not release bundles. The older AUD-027 HTML hashes remain historical.", "",
                  "| Local artifact | Bytes | SHA-256 |", "| --- | --- | --- |"]
        for item in phase["artifacts"]:
            lines.append(f"| `{item['path']}` | {item['bytes']} | `{item['sha256']}` |")
        lines += ["", "### Verification limits and release blockers", ""]
        lines.extend(f"- {item}" for item in phase["limitations"])
        lines += ["", "Release blockers still require canonical WASM source comparison, released upstream packages and the recorded browser/selective acceptance. The owner did not request a release. Fixes were made only in this checkout; no commit, push or publication was performed.", ""]
        return "\n".join(lines)


if __name__ == "__main__":
    RemediationRecord().run()
