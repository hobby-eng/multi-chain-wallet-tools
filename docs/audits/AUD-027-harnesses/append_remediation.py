"""Append authorized remediation without replacing the baseline audit or its evidence."""

import datetime
import hashlib
import json
import pathlib
import re
import subprocess

from capture import ReviewCommand


OWNERS = {
    "bip39-runtime-domain": "packages/crypto-core/src/bip39-parameters.ts",
    "bip39-width-geometry": "packages/crypto-core/src/bip39-parameters.ts",
    "injected-rng-contract": "packages/crypto-core/src/random-byte-source.ts",
    "checked-generation-profile-and-assessment": "apps/key-derivation/src/ui/recovery-mhfe-draw-outlook.ts",
    "bip38-password-material": "packages/crypto-core/src/bip38-password-material.ts",
    "eip55-checksum": "packages/crypto-core/src/eip55.ts",
    "bip32-wire-versions": "packages/crypto-core/src/networks.ts",
    "bitcoin-address-network-facts": "packages/crypto-core/src/bitcoin-address-facts.ts",
    "dash-platform-address-facts": "packages/crypto-core/src/dash-platform-address-facts.ts",
    "bitcoin-purpose-profile": "packages/coin-protocols/src/coins/bitcoin/profiles.ts",
    "dash-runtime-dispatch": "packages/coin-protocols/src/coins/dash/runtime.ts",
    "dash-compact-message-profile": "packages/crypto-core/src/compact-message-dash-profile.ts",
    "dash-history-budget": "packages/dash-network/src/history-budget.ts",
    "mhfe-package-file-enumeration": "tooling/vendored-mhfe-package.mjs",
    "build-option-and-legality-policies": "tooling/tool-build-policy.mjs",
    "balanced-template-element-scan": "tooling/html-elements.mjs",
    "offline-wasm-construction": "tooling/wasm-build.mjs",
    "standalone-html-mechanics": "tooling/html-artifact.mjs",
    "canonical-wasm-membership": "tooling/wasm-modules.mjs",
    "html-builder-dispatch": "tooling/build-profile-definitions.mjs",
    "toolchain-version-and-resolution": "tooling/toolchain-pins.json",
    "codex32-identifier": "packages/recovery-backup/src/codex32.ts",
    "bip32-index-metadata": "packages/crypto-core/src/bip32-limits.ts",
    "sskr-group-parameters": "packages/recovery-backup/src/sskr-groups.ts",
    "embedded-worker-resource-lifetime": "packages/shared-ui/src/embedded-worker-resource.ts",
    "wallet-matcher-result-target-policy": "packages/wallet-recovery/src/address-search.ts",
    "platform-proof-index-reconciliation": "packages/dash-network/src/platform-proof-index.ts",
    "orchard-capability-and-page-lifetime": "packages/dash-network/src/viewing-capability.ts",
    "exact-atomic-decimal-conversion": "packages/crypto-core/src/atomic-amount.ts",
    "psbt-v2-required-lock-unit-compatibility": "apps/psbt-inspector/src/psbt-locktime.ts",
    "relative-sequence-lock-decoding": "apps/psbt-inspector/src/consensus-limits.ts",
    "builder-relative-time-unit-conversion": "apps/psbt-inspector/src/policy-lock.ts",
    "scanner-network-concurrency-parameters": "apps/discovery-scanner/src/concurrency-parameters.ts",
    "scanner-orchestration-concurrency-parameters": "apps/discovery-scanner/src/concurrency-parameters.ts",
}

DISPOSITIONS = {
    "AUD-022-UI001": "Final Check parameters and verdict publication belong to the captured input revision; original deferred-parameters probe now passes.",
    "AUD-022-API005": "MhfeRun guards every await and callback through completion; seal uses that run. Original rekey probe and Encode/New wallet Cancel/Clear regressions pass.",
    "AUD-024-API004": "PublicExportSession owns current result and pending export across controllers; a new scan invalidates old exports. Original Scanner probes and integrated Viewer lifecycle pass.",
    "AUD-027-DOC001": "Removed-source links in the historical AUD-024 Markdown are retained as historical code labels; the metadata/link gate passes without changing old results.",
    "AUD-024-ARC001": "Protocol facts, injected entropy admission and BIP38 material preparation have shared owners; bounded independent AES/EIP55/derivation and refusal checks pass.",
    "AUD-024-ARC002": "Codex32/SSKR admission and embedded worker resources have shared owners; constructor, failure, cancellation and worker readiness contracts pass.",
    "AUD-024-ARC003": "Proof/index reconciliation, viewing admission, atomic arithmetic, Inspector locktime and Scanner budgets delegate to shared owners; nearest bounded contracts pass.",
    "AUD-024-ARC004": "Build legality, script dispatch, WASM role catalogs, pinned versions and staging cleanup share owners; bounded tooling, no-npm catalog bootstrap and eight default-edition builds pass.",
    "AUD-024-ARC005": "Inactive UI/worker entry fields are removed; profile/generated-entry contracts and actual default-edition builds exercise live composition.",
    "AUD-024-DOC001": "The latest-audit overview already identifies AUD-027, and the current project-facts gate passes. This does not replay historical checks.",
    "AUD-023-ARC002": "The normal upstream sync vendors ShareRestore and the host delegates restore/repair to it; ten host-share tests and strict TypeScript pass.",
}

FINAL_CHECKS = [
    "remediation-source-lifecycle-final", "remediation-original-mhfe-probe-final",
    "remediation-original-scanner-probe-final", "remediation-derivation-protocols",
    "remediation-shares-workers-inspector", "remediation-public-final",
    "remediation-tooling-complete", "remediation-tooling-final", "remediation-boundaries-catalog",
    "remediation-backup-rng-admission", "remediation-codex-admission",
    "remediation-mhfe-manifest-final", "remediation-sync-check-final",
    "remediation-static-container-final", "remediation-format-final", "remediation-check-completion",
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def public(value):
    if isinstance(value, str):
        return re.sub(r"/home/[^/\s]+/", "/home/user/", value)
    if isinstance(value, list):
        return [public(item) for item in value]
    if isinstance(value, dict):
        return {key: public(item) for key, item in value.items()}
    return value


class RemediationRecord:
    """Own the appended phase and retain the baseline as historical evidence."""

    def __init__(self):
        self.root = pathlib.Path(__file__).resolve().parents[3]
        self.evidence = self.root / "docs/audits/AUD-027-evidence"
        self.report = self.root / "docs/audits/AUD-027-2026-10-08.json"
        self.markdown = self.report.with_suffix(".md")

    def run(self):
        report = json.loads(self.report.read_text())
        if "authorizedRemediation" in report:
            raise SystemExit("A remediation phase already exists; do not overwrite retained results.")
        baseline = json.loads((self.evidence / "remediation-baseline.json").read_text())
        source = ReviewCommand("remediation-report", []).source()
        old = {item["path"]: item["sha256"] for item in baseline["files"]}
        changed = [item for item in source["files"] if item["sha256"] != old.get(item["path"])]
        now = datetime.datetime.now(datetime.UTC).isoformat()
        commands = []
        for path in sorted(self.evidence.glob("remediation-*.command.json")):
            entry = json.loads(path.read_text())
            name = path.name.removesuffix(".command.json")
            log = self.evidence / f"{name}.log"
            assert digest(log) == entry["logSha256"], name
            text = re.sub(r"\x1b\[[0-9;]*m", "", log.read_text())
            summary = re.findall(r"(?:Test Files|Tests)\s+([^\n]+)", text)
            commands.append({"name": name, **public(entry), "recordSha256": digest(path),
                             "summary": summary or ([text.strip().splitlines()[0]] if text.strip() else ["exit recorded; no output"]),
                             "localEvidence": True})
        by_name = {item["name"]: item for item in commands}
        assert all(by_name[name]["exitCode"] == 0 for name in FINAL_CHECKS)
        families = []
        for item in report["duplicationRegister"]["families"]:
            path = OWNERS[item["key"]]
            families.append({"key": item["key"], "findingId": item["findingId"],
                             "baselineStatus": item["status"], "status": "source-consolidated",
                             "owner": path, "ownerSha256": digest(self.root / path),
                             "scope": "Original inspected first-party definitions; independent fixtures and vendored implementations remain separate."})
        assert len(families) == len(OWNERS) == 34
        dispositions = [{"id": key, "status": "verified", "fixCommit": None,
                         "verificationCommit": None, "verifiedAtUtc": now,
                         "phase": "authorized-remediation", "evidence": value,
                         "sourceFingerprint": source["fingerprint"],
                         "verificationScope": "Stated bounded source/contract checks; no full-runtime or release certification."}
                        for key, value in DISPOSITIONS.items()]
        artifacts = []
        for item in commands:
            log = (self.evidence / f"{item['name']}.log").read_text()
            match = re.search(r"Built (dist/[^\n]+) \(([\d,]+) bytes\)\nSHA-256 ([0-9a-f]{64})", log)
            if match is not None and item["exitCode"] == 0:
                path, size, sha = match.groups()
                if digest(self.root / path) == sha:
                    artifacts.append({"path": path, "bytes": int(size.replace(",", "")), "sha256": sha,
                                      "command": item["name"], "localIgnoredOutput": True})
        # Earlier builds superseded by the final source are retained as commands, not current assets.
        artifacts = list({item["path"]: item for item in artifacts}.values())
        assert len(artifacts) == 8
        vendor = json.loads((self.root / "packages/recovery-mnemocode/source.json").read_text())
        mapping = json.loads(subprocess.check_output([
            "node", "--input-type=module", "-e",
            'import { MNEMOCODE_FILES } from "./tooling/sync-mnemocode-source.mjs"; '
            'console.log(JSON.stringify(Object.fromEntries(Object.entries(MNEMOCODE_FILES).map(([upstream, local]) => [local, upstream]))));'
        ], cwd=self.root))
        mismatches = []
        for path, expected in vendor["files"].items():
            local = self.root / "packages/recovery-mnemocode/source" / path
            assert digest(local) == expected, path
            upstream = self.root.parent / "mnemocode" / mapping[path]
            if not upstream.is_file() or digest(upstream) != expected:
                mismatches.append(path)
        assert not mismatches, mismatches
        phase = {
            "completedAtUtc": now, "reviewer": {"name": "Codex coordinator", "model": None, "reasoningEffort": None},
            "authorization": "The owner requested all findings fixed and resumed the work; no commit/publication authorization.",
            "actualHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=self.root).decode().strip(),
            "baselineSourceFingerprint": baseline["sourceFingerprint"], "sourceFingerprint": source["fingerprint"],
            "sourceFileCount": len(source["files"]), "changedSources": changed,
            "procedure": [{"path": item["path"], "sha256": digest(self.root / item["path"])} for item in report["procedure"]],
            "originalReportSha256": digest(self.report), "originalMarkdownSha256": digest(self.markdown),
            "commands": commands, "acceptedCommands": FINAL_CHECKS, "families": families,
            "dispositions": dispositions, "artifacts": artifacts,
            "mnemocodeSync": {"fileCount": len(vendor["files"]), "manifestMatches": len(vendor["files"]),
                              "upstreamByteMatches": len(vendor["files"]), "manifestSha256": digest(self.root / "packages/recovery-mnemocode/source.json"),
                              "unreleased": vendor["unreleased"], "upstreamCommit": vendor["commit"],
                              "shareRestoreSha256": digest(self.root / "packages/recovery-mnemocode/source/sskr/share-restore.ts")},
            "documentationCorrections": [{"path": "docs/audits/AUD-024-2026-10-08.md", "sha256": digest(self.root / "docs/audits/AUD-024-2026-10-08.md"),
                                         "change": "Historical removed-source hyperlinks converted to code labels; original results retained."}],
            "workspaceInstruction": {"path": "../.github/instructions/bip-tools.instructions.md",
                                     "sha256": digest(self.root.parent / ".github/instructions/bip-tools.instructions.md"),
                                     "change": "Rust guidance reconciled from 1.98.1 to existing 1.99.0 pins; release-only long-vector rule retained."},
            "sourceFollowups": [
                {"key": "input-clear-does-not-revoke-inflight-results", "status": "fixed", "evidence": "InputRevision/MhfeTask/MhfeRun and per-repair revisions. Encode/New wallet/Check/hidden-session cases executed; Decode/Repair/search are source-traced plus shared-contract coverage, not individually replayed."},
                {"key": "review-choice-not-rechecked-at-consumer-awaits", "status": "fixed", "evidence": "Each affected consumer asserts ReviewChoice after its last preparation await, and task/run revision revokes changed inputs. Shared password review and operation tests pass."},
                {"key": "hidden-error-classification-can-skip-close", "status": "verified", "evidence": "Policy captured before opening the held session; later metadata failure and failed close reply injected. Clear all closes idle sessions and releases the gate."},
                {"key": "frontend-profile-metadata-copies", "status": "verified", "evidence": "Repair/PIM controls use core parameters; password bounds use password parameters; make defaults are delegated and descriptions count actual results. Changed-parameter and missing-parameter tests pass."},
            ],
            "limitations": ["Original baseline review and its failures remain historical; this is an appended authorized remediation phase.",
                            "Five helpers produced partial scoped edits, then reached account limits. The coordinator completed integration and bounded verification; no independent final specialist certification.",
                            "No browser, full vector replay, real BIP38 scrypt/MHFE Argon2, mass PDF/cards, Docker/native/WASM rebuild, provider request, remote CI, commit, push, tag or release.",
                            "Default HTML builds use unchanged committed WASM and passed their composition gates. No full matrix, runtime browser equivalence or independent reproducibility claim.",
                            "One worker and Node heap 1536 MiB; observed physical-memory samples below 14 GiB used. No continuous peak guarantee across other sessions.",
                            "The upstream MnemoCode copy remains explicitly unreleased; existing CI/release refusal is retained. The host is not release-ready merely because local tests pass.",
                            "Dash distribution was read-only; its Rust pins already say 1.99.0. No other project repository was edited by this session.",
                            "JavaScript string erasure and all secret lifetimes are not proven by these tests. Both MHFE Argon2 engines, launchers and Envelope Argon2 remain required."]}
        (self.evidence / "remediation-source-final.json").write_text(json.dumps(source, indent=2) + "\n")
        (self.evidence / "remediation-original-report.json").write_bytes(self.report.read_bytes())
        (self.evidence / "remediation-original-report.md").write_bytes(self.markdown.read_bytes())
        report["authorizedRemediation"] = public(phase)
        report["remediation"].extend(dispositions)
        self.report.write_text(json.dumps(public(report), indent=2) + "\n")
        self.markdown.write_text(self.markdown.read_text() + self.section(phase))
        print(json.dumps({"families": 34, "dispositions": len(dispositions), "artifacts": 8,
                          "sourceFingerprint": source["fingerprint"], "changedSources": len(changed)}))

    def section(self, phase):
        lines = ["", "## Authorized remediation — 2026-10-09 (UTC)", "",
                 f"Completed at `{phase['completedAtUtc']}`. The baseline sections above describe the original reviewed source and are retained unchanged. This phase follows the owner's explicit request to fix all findings; it does not change the original audit date, HEAD, failures or hashes.", "",
                 f"Actual working HEAD: `{phase['actualHead']}`; uncommitted source fingerprint: `{phase['sourceFingerprint']}` ({phase['sourceFileCount']} files, excluding audit records/evidence). Remediation baseline: `{phase['baselineSourceFingerprint']}`. Changed-source hashes and the exact commands are in the JSON companion; full manifests/logs are local-only in `AUD-027-evidence/`.", "",
                 "Exact service model and effort are unknown. Five scoped helpers produced partial edits before account limits; the coordinator finished integration and checks. This is bounded remediation verification, not an independent final cryptographic audit.", "",
                 "### Current dispositions", "", "The earlier open/deferred rows remain historical. These dated rows record the current scoped result; no signed fix or verification commit exists.", "",
                 "| Finding ID | Status | Fix commit | Verification commit | Evidence |",
                 "| --- | --- | --- | --- | --- |"]
        for row in phase["dispositions"]:
            lines.append(f"| {row['id']} | verified | Uncommitted | Source SHA-256 manifests | {row['evidence']} |")
        lines += ["", "### Rule owners after remediation", "",
                  "All 34 original first-party families now have a shared owner at their inspected sites: the 26 previously open/partial families were consolidated; eight already shared families were retained. This does not count independent test expectations or unchanged upstream source as duplicates, and does not claim an exhaustive count of all possible repetition.", "",
                  "| Original family | Baseline | Current owner |", "| --- | --- | --- |"]
        for row in phase["families"]:
            lines.append(f"| `{row['key']}` | {row['baselineStatus']} | `{row['owner']}` |")
        lines += ["", "### MHFE and MnemoCode integration", "",
                  "MHFE now binds awaited results and callbacks to their input/run lifetime. Source edits, Cancel and Clear cannot republish old cards; completing a run prevents its old Cancel handle from stopping later work. Hidden-wallet refusal policy is loaded before a held session opens; fatal/cleanup failures release the session, and Clear all closes an idle session. InputRevision excludes job answers and a recovered result's own interactive checks from edits of the original request.", "",
                  "Passwords are checked again after the final preparation awaits. The page renders PIM/repair limits from core parameters, and word/character password limits from password parameters; new-password defaults are requested from the library. The pinned MHFE browser package was not modified. Both Argon2 engines remain present.", "",
                  f"MnemoCode normal sync now includes ShareRestore: {phase['mnemocodeSync']['fileCount']}/{phase['mnemocodeSync']['fileCount']} listed files match both their manifest and the upstream checkout at completion. MnemoCodeShares delegates restore and repair; local output/list presentation stays in the host. ShareRestore SHA-256: `{phase['mnemocodeSync']['shareRestoreSha256']}`. The upstream owner fixed optional AbortSignal forwarding; no local vendor patch was made. The manifest still identifies an unreleased working-tree copy, and the existing release refusal remains.", "",
                  "The four original source follow-ups are corrected. Encode/New wallet/Check and hidden-session lifetimes have direct synthetic operation regressions. Decode/quick Repair/missing-word search are source-traced through the shared lifetime owner, with no claim that every UI/error path was separately replayed.", "",
                  "### Checks and retained diagnostics", "",
                  "Run-level counts below overlap; they are not added into a combined total. Every remediation command, including failures and scoped reruns, is retained in the JSON with UTC times, exit code, log/record hashes and source fingerprints. All executions used bounded public/synthetic input, one test worker and Node heap 1536 MiB.", "",
                  "| Command record | Result | Log SHA-256 |", "| --- | --- | --- |"]
        by_name = {item["name"]: item for item in phase["commands"]}
        for name in FINAL_CHECKS:
            row = by_name[name]
            lines.append(f"| `{name}` | exit {row['exitCode']}; {'; '.join(row['summary']).replace('|', '/')} | `{row['logSha256']}` |")
        lines += ["", "The retained intermediate failures were investigated: an incorrect atomic-value fixture was corrected with exact decimal arithmetic; synthetic DOM/password/MHFE fixture contracts were completed; wrapper assertions were updated to the live Node orchestrator; upstream optional-signal type errors were fixed by its owner. Sandbox child-process EPERM results remain diagnostics and the unchanged commands passed outside that restriction. No failed assertion or public vector was removed to obtain a pass.", "",
                  "Two additional extraction defects were corrected before handoff: Docker copy-out no longer includes the temporary container ID or claims a clean checkout when Git metadata is unavailable; the catalog's RustSec bootstrap lazily loads build-only npm code and its workflow selects the pinned Node version. Synthetic failure/cleanup/no-npm-import checks cover these corrections.", "",
                  "### Fresh local HTML", "",
                  "Eight default-edition pages built successfully, including the built-in composition/offline/Dash graph checks. These are ignored local outputs using committed WASM; they are not release bundles or browser acceptance evidence.", "",
                  "| Artifact | Bytes | SHA-256 |", "| --- | --- | --- |"]
        for row in phase["artifacts"]:
            lines.append(f"| `{row['path']}` | {row['bytes']} | `{row['sha256']}` |")
        lines += ["", "### Limits and remaining release work", ""]
        lines.extend(f"- {text}" for text in phase["limitations"])
        lines += ["", "Workspace Rust guidance now matches the existing 1.99.0 pin. The shared rule that long vector replays run only at release remains in place. No toolchain was installed or downgraded.", ""]
        return "\n".join(lines)


if __name__ == "__main__":
    RemediationRecord().run()
