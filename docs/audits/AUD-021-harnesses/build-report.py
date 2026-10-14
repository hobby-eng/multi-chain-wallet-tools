"""Assemble AUD-021 from retained command records and the reviewed snapshot."""

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
AUDITS = ROOT / "docs/audits"
EVIDENCE = AUDITS / "AUD-021-evidence"
BASE = "AUD-021-2026-10-03"


def load(path):
    return json.loads(path.read_text())


snapshot = load(EVIDENCE / "snapshot.json")
final = load(EVIDENCE / "final-snapshot.json")
procedure = load(EVIDENCE / "procedure-hashes.json")
commands = [load(path) for path in sorted(EVIDENCE.glob("*.command.json"))
            if path.stem not in {"final-validation.command", "report-format.command"}]

# Each entry describes actual review evidence; it is not an assertion that every possible case passed.
details = {
    "SEC-001": ("All tools; spending and viewing material", "Threat-model/source trace and browser reveal/Clear probes", "passed", "SECURITY_AUDIT.md; secret-boundary; Scanner validated exports; Deriver/Inspector offline documents; browser regressions. Host compromise and immutable strings remain outside the guarantee."),
    "SEC-002": ("Eight HTML pages, opaque Scanner vault, network Worker", "Effective CSP/iframe probes, port contracts and artifact graph gates", "passed", "16 direct-file runs and 50 browser regressions; sandbox without allow-same-origin, blocked inline scripts/network in secret realms, fixed message capabilities."),
    "SEC-003": ("Viewer and Scanner public requests/exports", "Runtime secret-guard tests, allowlist/DTO traces and build graph gates", "passed", "Current full suite and historical API harness rerun; NFKD/encoded/nested guards inspected. Pattern detection is a tripwire, not protection against arbitrary malicious code in the vault."),
    "SEC-004": ("Chosen-word generation and recovery encryption", "CSPRNG trace, injected RNG boundary tests and official/independent vectors", "passed", "crypto-core secure-random and bip39-chosen-words; production crypto.getRandomValues; envelope and recovery tests; embedded MHFE reduced-cost vector. No new cryptographic security proof asserted."),
    "SEC-005": ("Workers, temporary buffers, UI revisions and exports", "Cleanup/error source trace plus full suite and browser Clear/Cancel/edit tests", "passed", "Disposable MHFE Worker, chosen-word generator finally cleanup, zeroize/scan tests, stale result rejection and public export guards. Browser/OS erasure is not guaranteed."),
    "SEC-006": ("DOM, storage, generated glue and exports", "Source sink searches, runtime persistence/CSP probes and CSV guards", "passed", "No new active source eval/innerHTML/storage sink found; reviewed generated glue excluded from lexical false positives; browser probes check local/session storage, caches and cookies."),
    "SEC-007": ("Read-only SDK graphs and provider/parser resource limits", "AST/artifact gates, parser tests and bounded production HTTP probe", "failed", "AUD-021-SEC001: Bitcoin/Ethereum response.text() consumes an oversized body before checking the limit; 22 MiB fixture fully read, no cancellation. Dash streamed-reader control passed."),
    "FUN-001": ("All BIP39 widths; chosen-word constraints", "Literal/reference vectors and current crypto-core tests", "passed", "All lengths, checksum/entropy/seed distinctions and constrained generation exercised in the 1443-test suite; chosen words are not uniform over all original entropy states."),
    "FUN-002": ("Bitcoin, Dash and Ethereum adapters; both editions", "Independent derivation vectors, adapter tests, DIP13 and Orchard checks", "passed", "Full suite covers public/private paths, receive/change, profile/network versions, Dash identity/payment/mobile layouts; DIP13 replay and embedded fixed self-tests passed."),
    "FUN-003": ("BIP85/BIP38, message verification and Silent Payments", "Literal/reference tests and actual browser round trips", "passed", "Native full suite; browser BIP85, BIP38/message cases in both engines and supported profiles. No hardware-wallet or live signing exercise."),
    "FUN-004": ("Scripts, descriptors, policy builders and multisig", "Core/reference fixtures, negative contracts and browser policy flows", "passed", "PSBT/descriptor/MuSig2/Miniscript tests; malformed replacement hides old compiled results; script commitment and public-key membership checks inspected."),
    "FUN-005": ("Bitcoin/Dash transaction and PSBT contexts", "Pinned Core fixtures, schema/UTXO traces and browser decoding", "passed", "Full suite covers framing, UTXO binding, commitments, locktimes and network-specific behavior; signature fields are explicitly not cryptographically verified by the Inspector. No live regtest run."),
    "FUN-006": ("SeedQR, MnemoCode, SLIP-39, SSKR, Codex32, Envelope and MHFE", "Published fixtures, core tests, browser round trips and printed-text check", "partial", "Recovery tests and full browser workflows passed. MHFE received reduced-cost embedded-core verification and Worker initialization/Stop coverage; full-cost vectors, multi-threaded 2 GiB execution and suite 4 are outside this HTML audit."),
    "FUN-007": ("Viewer/Scanner providers, proofs, completeness and balances", "Mocked HTTP/SDK production paths and full suite", "passed", "Bitcoin/Ethereum/Dash histories, RPC IDs, null/zero/partial status, Orchard scope/nullifier/stream handling and atomic-unit accounting tested. No live endpoint availability or independent chain consensus attestation."),
    "API-001": ("Runtime discriminants, typed arrays and adapter seams", "Current full suite, historical API harness and source traces", "passed", "Two retained AUD-020 API regressions rerun; strict request DTO/operation validation, RNG contracts, SSKR enums and dependency variants remain enforced."),
    "API-002": ("Async state, cancellation, Worker readiness and revisions", "Browser regressions and controller/stream tests", "passed", "50 browser cases include Clear/Cancel before readiness, edits, stale verifier results, source/tab changes and recovery handoff. Timeout spans body read, but does not impose a byte ceiling (SEC001)."),
    "API-003": ("Public CSV/JSON/XLSX and private reveal-gated exports", "Production export tests and actual browser downloads", "passed", "Monetary fidelity tests cover BTC/ETH and synthetic future units; scan/export guards stage validation before caching. Selection, redaction and CSV injection controls tested in current suite."),
    "API-004": ("Backup and address/import encoding boundaries", "Official encoded fixtures, independent references and browser import/export", "passed", "Base58/Bech32, PSBT CompactSize, CBOR/UR/Bytewords, SeedQR, mnemonic widths and recovery transports covered. Round trips are supplemented by literal/independent fixtures."),
    "BLD-001": ("Both editions and conditional feature/coin compositions", "Manifest/profile gates and 70 compiled smoke variants", "passed", "Default eight artifacts, physical Dash-only exclusions and no-Dash/no-Bitcoin/minimal/watch-only compositions checked by canonical verify and matrix smoke."),
    "BLD-002": ("Build matrix and selective runtime variants", "Fresh planner, bounded smoke compilation and two-engine runtime", "passed", "35,156 legal combinations planned; 70 smoke variants compiled; five selective variants ran in each engine (10/10). Exhaustive compilation was not performed."),
    "BLD-003": ("npm/Rust locks, provenance, source pins and notices", "Frozen canonical install, integrity gates, npm audit and five RustSec locks", "passed", "Zero npm advisories and zero RustSec vulnerability advisories. Unmaintained atomic-polyfill/paste warnings remain. MHFE browser package is a hash-pinned upstream artifact, not one of the four rebuilt modules."),
    "BLD-004": ("Orchard, Codex32, Envelope and SSKR WASM", "Fresh --no-cache canonical Docker artifacts target", "passed", "All committed generated files and the WASM manifest matched freshly rebuilt bytes. Eight resulting canonical HTML pages also match native and browser-tested pages."),
    "BLD-005": ("HTML, flat canonical bundles, CI/release workflow source", "Canonical verify, artifact/verification-record checks and static workflow review", "partial", "Local source/CSP hashes, sidecars, allowlists, verification record and fresh flat bundles passed. gh found no current-commit run; remote job success, publisher signatures and real release publishing were not attested."),
    "UI-001": ("Eight real file pages; Chromium/Firefox; 390/800/1280 widths", "16 startup runs, layout checker and representative screenshot inspection", "passed", "16/16 direct-file runs; layout findings=[] across eight pages at three widths. Four screenshots inspected, including one per tool; not all 32 screenshots manually reviewed."),
    "UI-002": ("Navigation, constrained generation, backup and result revisions", "50 browser regressions and expanded-panel layout probes", "passed", "Tabs, editable inputs, descriptor/worker state, source handoff, reveal controls, mobile layout and Clear/restart checked against actual pages."),
    "UI-003": ("Secret reveal/copy, help, QR and exported cards", "Browser interaction plus targeted host Poppler printed-text test", "partial", "Recovery help/QR/cards/reveal workflows passed; Docker lacked Poppler for one test, which passed separately on host. Dedicated screen-reader/assistive-technology acceptance was not performed."),
    "ARC-001": ("Module ownership and build/network composition", "Manifest/import graph and current production seam review", "passed", "Source ownership remains split between offline secret logic, network-boundary DTOs, providers and shared UI; conditional imports are verified in fresh builds."),
    "ARC-002": ("Dead code, duplication and dynamic-code false positives", "Source searches, current delta review and graph gates", "passed", "Generated/test-only code distinguished from browser production paths. No unsupported cleanup/refactor introduced; shared body-reader mismatch is tracked as SEC001."),
    "ARC-003": ("Comments, tests and production-path fidelity", "Read current contracts, fixtures, controlled faults and audit probe imports", "passed", "Tests exercise actual adapters/controllers; stream probe imports fetchJson/readProviderJson directly. Skipped fixture generator and optional Poppler test are identified explicitly."),
    "DOC-001": ("All tool READMEs, safety text and displayed release passports", "Source/HTML capability and warning comparison", "passed", "Offline/connected boundaries, experimental status, viewing-key privacy, non-authenticated MHFE results and constrained-word entropy warnings match the implemented interfaces."),
    "DOC-002": ("Commands, versions, upstream notices and source distributions", "Canonical metadata/provenance/legal gates and displayed version comparison", "failed", "AUD-021-DOC001: six release passports show wasm-bindgen 0.2.128 rather than the pinned/built 0.2.129. Existing native release copies were not rebuilt by build:html; fresh canonical bundles are covered."),
    "DOC-003": ("AUD-019/020 context and new AUD-021 evidence", "Prior finding reconciliation plus paired report/schema/hash validation", "passed", "Old reports are not rewritten; fresh commands and initial helper failure are retained. No prior snapshot results are presented as new runs."),
}
guide = (ROOT / "docs/FULL_AUDIT_GUIDE.md").read_text()
ledger = []
for code, title in re.findall(r"^### CHECK-([A-Z]+-[0-9]{3}) — (.+)$", guide, re.M):
    scope, method, outcome, evidence = details[code]
    ledger.append({"checkId": "CHECK-" + code, "group": title, "toolScope": scope,
                   "method": method, "outcome": outcome, "evidence": evidence})
assert len(ledger) == len(details) == 32

finding = {
    "id": "AUD-021-SEC001", "category": "SEC", "kind": "finding",
    "title": "Bitcoin/Ethereum provider response ceiling is checked after unbounded body buffering",
    "severity": "medium", "status": "open", "releaseBlocking": True,
    "releaseBlockingReason": "Reviewer recommends fixing before publishing the affected connected tools; the intended availability ceiling is not enforced during ingestion. This does not demonstrate secret compromise or affect the offline tools.",
    "affectedFiles": ["packages/public-data-providers/src/http.ts:10-25"],
    "affectedBuilds": "Multi-Chain Activity Viewer and Discovery Scanner Bitcoin/Ethereum HTTP paths. Dash's separate streamed reader, offline Deriver and Inspector are outside the demonstrated defect.",
    "evidence": ["docs/audits/AUD-021-harnesses/availability.audit.test.ts",
                 "docs/audits/AUD-021-evidence/public-provider-availability.log"],
    "reproduction": "Run pnpm exec vitest run --config docs/audits/AUD-021-harnesses/vitest.config.mjs. The first test supplies production fetchJson a finite 22 x 1 MiB synthetic ReadableStream through a stubbed fetch. The second applies the existing Dash streamed JSON reader to the same fixture and ceiling. No real provider or wallet is contacted.",
    "expected": "Cancel body ingestion once actual received bytes exceed the configured maximum; do not require buffering the entire untrusted body before rejecting it.",
    "observed": "Public provider emitted all 22 chunks and was not cancelled: {emitted:22,cancelled:false}. Only then did the size-limit error fire. The safety assertion failed; the Dash bounded-reader control passed. Current text.length counts UTF-16 code units, not received bytes.",
    "impact": "An unexpectedly large or hostile response from an approved external provider can cause excessive allocation, Worker/page unresponsiveness or memory exhaustion before rejection. The finite probe demonstrates ineffective ingestion limiting, not an actual OOM, key leak or unauthorized transaction. Exploitation requires an oversized provider response; arbitrary endpoint injection is not demonstrated.",
    "recommendedFix": "Read the Response stream under a named byte ceiling and cancel its reader as soon as limit+1 is observed. Content-Length may be an early check but cannot be authoritative. Reuse the existing bounded-reader pattern through a neutral shared layer without a module cycle; preserve timeout/abort through body decoding and fail closed on malformed JSON.",
    "requiredVerification": "Retain this failing production-path test and make it pass after the fix. Add exact-limit and limit+1 byte cases, absent/false Content-Length, multi-byte UTF-8 and body-phase abort. Verify provider/controller failures remain error or incomplete rather than zero-balance success. Rerun nearest provider/adapter tests and affected browser cases.",
}
metadata_finding = {
    "id": "AUD-021-DOC001", "category": "DOC", "kind": "finding",
    "title": "Six displayed release passports retain the previous wasm-bindgen version",
    "severity": "low", "status": "open", "releaseBlocking": False,
    "affectedFiles": ["apps/activity-viewer/src/index.html:412",
                      "apps/discovery-scanner/src/index.html:698",
                      "apps/key-derivation/src/index.html:2122"],
    "affectedBuilds": "Activity Viewer, Discovery Scanner and Key Derivation Tool in both editions.",
    "evidence": ["docs/audits/AUD-021-harnesses/check-metadata.py",
                 "docs/audits/AUD-021-evidence/displayed-build-metadata.log"],
    "reproduction": "Build the current eight HTML pages and run python3 docs/audits/AUD-021-harnesses/check-metadata.py. Compare the rendered release-passport wasm-bindgen phrase with packages/dash-shielded-wasm/rust/Cargo.toml and Cargo.lock, and the canonical Docker pin.",
    "expected": "Displayed dependency metadata agrees with the exact 0.2.129 WASM library/CLI version used for the freshly verified local integrations.",
    "observed": "All six applicable HTML passports display wasm-bindgen 0.2.128; canonical Cargo inputs and Docker builder use 0.2.129. Six mismatches reproduced. The separate upstream MHFE package's own internal versions are not the source of this phrase.",
    "impact": "Incorrect source/build information misleads a reviewer about the shipped runtime. Binary integrity and deterministic outputs still passed; no cryptographic or spending defect is demonstrated.",
    "recommendedFix": "Update the three template passages to the current version and preferably derive this displayed field from the same canonical metadata source so future upgrades do not leave it stale.",
    "requiredVerification": "Rebuild both editions and make the six passport comparisons pass; verify source/provenance/CSP hashes and artifact gates after the template edit. Do not rewrite unrelated upstream MHFE notices.",
}
findings = [finding, metadata_finding]
limitations = [
    "Full scope was reviewed, but this is a recorded engineering audit, not independent cryptographic certification or proof that all defects are absent.",
    "No real private material, live mainnet/testnet provider scan, Core regtest, hardware-wallet interoperability, real publication or publisher-signature validation was performed.",
    "Only 70 of 35,156 legal build combinations were compiled; representative selective variants were runtime-tested. Dedicated assistive-technology acceptance was not performed.",
    "MHFE's full-cost 2 GiB vector corpus, threaded execution and suite 4 were not exercised here. The embedded upstream MHFE 0.4.0 package documents suite 3; its reduced-cost fixed vector and UI Worker boundaries passed.",
    "The four local WASM modules were rebuilt; the separate hash-pinned MHFE browser package was not regenerated. Neither all upstream dependency internals nor alternative operating systems were manually audited.",
    "RustSec has unmaintained atomic-polyfill and paste warnings despite zero vulnerability advisories. Advisory absence is not a correctness guarantee.",
    "GitHub returned no runs for the reviewed commit. Local checks and static workflow review do not establish remote CI/release completion.",
    "The Docker suite skipped one optional Poppler assertion and ignored one intentional Rust fixture-regeneration helper. The Poppler assertion subsequently passed on the host; skipped filtered tests were not counted as new passes.",
    "Native build:html updated eight tool pages, not earlier dist release folders. Only fresh canonical release bundles and the identified eight browser-tested native pages are approved by the build checks.",
    "No product source changed. Retained additions are this report pair, audit index entry and reproducible harnesses; generated evidence remains ignored and local.",
]
report = {
    "schemaVersion": 1, "auditId": "AUD-021", "auditNumber": 21, "date": "2026-10-03",
    "title": "Full audit of four Wallet Tools HTML applications in both editions",
    "reviewer": {"name": "Codex/OpenAI", "model": None, "reasoningEffort": None,
                 "note": "Exact runtime model identifier and effort were not exposed; no historical settings inferred."},
    "snapshot": {"commit": snapshot["commit"], "commitComplete": True,
                 "tree": snapshot["tree"], "workingTree": {"baseline": snapshot["initialWorkingTree"],
                 "completion": "Audit-owned report/index/harness changes only; reviewed product files unchanged."},
                 "sourceFingerprint": final["trackedFileManifestSha256"],
                 "trackedFiles": len(snapshot["files"]), "artifacts": final["artifacts"],
                 "artifactRelationship": final["artifactRelationship"],
                 "releaseRelationship": final["releaseRelationship"]},
    "procedure": procedure,
    "scope": {"included": ["Activity Viewer", "Discovery Scanner seed and watch-only modes",
                            "Key Derivation Tool and Recover & Back Up", "PSBT & Multisig Inspector",
                            "Multi-Chain and Dash Community editions", "Shared libraries, browser workers, build graphs, dependencies, WASM provenance, CI/release configuration and documentation"],
              "data": "Published vectors and synthetic public-shaped fixtures only.",
              "method": "Current source/delta review, independent/reference test coverage, uncached canonical build, actual browser/security probes and a new controlled streaming fault probe."},
    "environment": final["environment"],
    "checks": {"coverageLedger": ledger, "commands": commands,
               "counts": {"vitestFilesPassed": 138, "vitestTestsPassed": 1443, "vitestTestsSkipped": 1,
                          "rustTestsPassed": 29, "rustFixtureGeneratorsIgnored": 1,
                          "browserFileRunsPassed": 16, "browserRegressionCasesPassed": 50,
                          "selectiveBrowserRunsPassed": 10, "matrixPlanned": 35156, "matrixCompiled": 70,
                          "printedTextTargetedPassed": 1, "printedTextFilteredSkipped": 11,
                          "newProbePassed": 1, "newProbeFailed": 1},
               "countNote": "Overlapping suites and scoped reruns are not added into a combined total.",
               "manualScreenshots": final["manuallyViewedScreenshots"]},
    "findings": findings, "observations": [],
    "remediation": [{"id": row["id"], "status": "open", "fixCommit": None,
                     "verificationCommit": None, "evidence": "Original reproduction retained; source unchanged."}
                    for row in findings],
    "limitations": limitations,
}
(AUDITS / (BASE + ".json")).write_text(json.dumps(report, indent=2) + "\n")

lines = [
    "# AUD-021 — Full audit of four Wallet Tools HTML applications in both editions", "",
    "## Record metadata", "",
    "- **Audit number:** 21.", "- **Completed (UTC):** 2026-10-03.",
    "- **Reviewer:** Codex/OpenAI; exact model identifier and reasoning effort are unknown.",
    f"- **Reviewed commit:** `{snapshot['commit']}`.",
    f"- **Source tree:** `{snapshot['tree']}`; baseline clean, all {len(snapshot['files'])} tracked files unchanged before report assembly.",
    f"- **Tracked-file manifest SHA-256:** `{final['trackedFileManifestSha256']}`.",
    "- **Working tree after review:** audit report/index/harness additions only. No product fix, commit, push or release.",
    "- **Artifact relationship:** fresh native HTML and uncached canonical Docker output match for eight tool pages. Fresh canonical flat release copies match those pages. Earlier native `dist/*/release` folders were not refreshed by `build:html` and are not approved by this audit.", "",
    "| Artifact relative to dist | SHA-256 |", "| --- | --- |",
]
lines += [f"| `{name}` | `{value}` |" for name, value in final["artifacts"].items()]
lines += ["", "| Procedure | SHA-256 |", "| --- | --- |"]
lines += [f"| `{name}` | `{value}` |" for name, value in procedure.items()]
lines += ["", "## Finding register", "", "| Finding ID | Category | Kind | Severity | Status | Title |",
          "| --- | --- | --- | --- | --- | --- |",
          f"| {finding['id']} | SEC | Finding | Medium | Open | {finding['title']} |",
          f"| {metadata_finding['id']} | DOC | Finding | Low | Open | {metadata_finding['title']} |", "",
          "## Review evidence", "", "### Scope and methodology", "",
          "Reviewed Activity Viewer, Discovery Scanner, Key Derivation Tool and PSBT & Multisig Inspector in both editions. The review includes shared TypeScript modules, actual browser Workers/opaque vaults, build composition, four canonical WASM integrations, dependency provenance, CI/release source and documentation. Only public vectors and synthetic inputs were used.", "",
          "Current first-party production behavior was traced through secret ownership, randomness, network allowlists, DTO validation, export guards, provider completeness, PSBT binding and cleanup. The post-AUD-020 delta was inspected; prior findings were context, not substitutes for newly recorded runs. Actual current full verification and browser suites were rerun. No upstream library internals are claimed to have received exhaustive manual cryptanalysis.", "",
          "### Environment", "",
          f"Linux host: `{final['environment']['os']}`; Node `{final['environment']['node']}`; `{final['environment']['packageManager']}`; Docker `{final['environment']['docker']}`. Canonical Rust `{final['environment']['canonicalRust']}`, wasm-bindgen `{final['environment']['canonicalWasmBindgen']}`.", "",
          "Installed packages: " + ", ".join(f"{name} {value}" for name, value in final["environment"]["packages"].items()) + ". Actual engines: Chromium 153.0.8010.12 and Firefox 155.0.", "",
          "Host Cargo/Rustup locations were kept under the workspace workingspace directory. The pinned Docker toolchain is 1.99.0, rather than the older global instruction's 1.98.1. No global toolchain or shell configuration changed.", "",
          "### Coverage ledger", "",
          "Outcomes apply to the recorded scope. Partial rows and limitations identify unexecuted work; a passed row is not an assertion about every possible input or configuration.", "",
          "| Check ID | Group | Tool/build scope | Method | Outcome | Evidence / gap |",
          "| --- | --- | --- | --- | --- | --- |"]
for row in ledger:
    lines.append("| " + " | ".join(str(row[key]).replace("|", "\\|") for key in
                 ("checkId", "group", "toolScope", "method", "outcome", "evidence")) + " |")
lines += ["", "### Checks and results", "",
          "- **Canonical Docker build:** uncached artifacts target passed. `pnpm verify` ran inside it: 138 Vitest files, 1443 tests passed, one optional printed-text test skipped; Rust suites passed 29 tests, with one deliberate fixture-regeneration helper ignored. All four regenerated WASM integrations and the generated manifest matched committed bytes. Metadata/provenance, fixed/reference vectors, Orchard streaming, startup self-tests, artifact/flat bundle/verification-record gates and 70 smoke builds passed.",
          "- **Printed PDF text:** the skipped optional test was run on the host with existing Poppler: one passed, 11 excluded by the name filter. This closes that specific coverage gap, without repeating or adding totals to the full suite.",
          "- **Browser files:** 16/16 direct-file startup runs across eight pages and two engines passed; 32 mobile/desktop screenshots retained. Four representative screenshots were inspected, one per tool. No new clipping/overlap was identified in those views.",
          "- **Browser regressions:** 50/50 passed, including effective CSP/storage probes, revisions/cancellation, descriptors, backup transfers, messages/BIP38, BIP85 and printed cards. Expected blocked CSP probe errors are evidence of denial, not failed application tests.",
          "- **Selective builds:** five selected variants ran in each engine, 10/10 passed. The full planner reported 35,156 combinations, and only the 70-variant smoke subset was compiled. These counts describe different coverage and are not added together.",
          "- **Layout:** all eight pages at widths 390, 800 and 1280 returned no findings. Expanded recovery/chosen-word controls were included by the current layout checker.",
          "- **Embedded MHFE:** actual bundled core and Argon2 single-thread build passed a reduced-cost fixed vector. The bundle is MHFE 0.4.0, suite 3, API 6, pinned to upstream `70dddd069b3e3bb6553a3a41c42713d1e09f2d87`; full-cost corpus and suite 4 were not run.",
          "- **Historical API regressions:** two current-source tests passed using the retained AUD-020 harness; older results were not reused.",
          "- **npm advisory scan:** zero advisories at every severity.",
          "- **RustSec:** all five current lockfiles returned zero vulnerability advisories. Database commit `ef6173cbc5c50ec8166f9a5b28f07834144373ee`, 1290 advisories. Unmaintained `atomic-polyfill` (Dash) and `paste` (Envelope/SSKR) warnings remain; no deny/ignore exception was added.",
          "- **Current remote CI:** `gh run list` returned an empty list for the reviewed commit. No remote CI success is inferred; local builds/checks and static pinned-action/permission/job-dependency review provide the recorded evidence.",
          "- **New availability probe:** one failed safety assertion and one passed Dash control. This is the expected reproduced finding, retained unchanged rather than relaxed to obtain green.",
          "- **Displayed build metadata:** six of six applicable passports fail the version comparison: 0.2.128 shown versus 0.2.129 pinned and built. The three source template passages are shared across editions. This is a new presentation defect, distinct from earlier README/build-guide findings.",
          "- **Artifact identity helper:** initial run also scanned old local flat release copies and failed on their mismatch. `build:html` only refreshes tool pages. Corrected enumeration compares eight current tool pages and the fresh canonical flat copies; all matched. Both command records remain retained. No product source was altered to resolve this harness scope error.", "",
          "### Exact commands and integrity evidence", "",
          "The recorder retains stdout/stderr, UTC timings, exit status, safe toolchain variables and log SHA-256. Logs and generated artifacts are local ignored evidence under `docs/audits/AUD-021-evidence/`. Commands below exclude report-format/final-validation maintenance steps, which are separately recorded.", ""]
for row in commands:
    lines += [f"- **{row['log'].removesuffix('.log')}** — exit `{row['exitCode']}`, log SHA-256 `{row['logSha256']}`.",
              "", "  ```text", "  " + row.get("command", " ".join(row["argv"])), "  ```", ""]
lines += ["### Findings", "", "#### AUD-021-SEC001 — Medium — Provider body ceiling is applied after buffering", ""]
for label, value in [("Category", "SEC"), ("Severity", "medium"), ("Status", "open"),
                     ("Release blocking", "true for affected connected-tool publishing; " + finding["releaseBlockingReason"]),
                     ("Affected files and builds", finding["affectedFiles"][0] + "; " + finding["affectedBuilds"]),
                     ("Reproduction", finding["reproduction"]), ("Expected behavior", finding["expected"]),
                     ("Observed behavior", finding["observed"]), ("Impact", finding["impact"]),
                     ("Recommended fix", finding["recommendedFix"]), ("Required verification", finding["requiredVerification"])]:
    lines.append(f"- **{label}:** {value}")
lines += ["- **Evidence:** [production-path stream probe](AUD-021-harnesses/availability.audit.test.ts) and local public-provider-availability.log. Harness instructions: [README](AUD-021-harnesses/README.md).", "",
          "#### AUD-021-DOC001 — Low — Displayed WASM version is stale", ""]
for label, value in [("Category", "DOC"), ("Severity", "low"), ("Status", "open"),
                     ("Release blocking", "false"),
                     ("Affected files and builds", "; ".join(metadata_finding["affectedFiles"]) + "; " + metadata_finding["affectedBuilds"]),
                     ("Reproduction", metadata_finding["reproduction"]),
                     ("Expected behavior", metadata_finding["expected"]),
                     ("Observed behavior", metadata_finding["observed"]),
                     ("Impact", metadata_finding["impact"]),
                     ("Recommended fix", metadata_finding["recommendedFix"]),
                     ("Required verification", metadata_finding["requiredVerification"])]:
    lines.append(f"- **{label}:** {value}")
lines += ["- **Evidence:** [displayed metadata comparison](AUD-021-harnesses/check-metadata.py) and local displayed-build-metadata.log.", "",
          "### Remediation and follow-up", "", "| Finding ID | Status | Fix commit | Verification commit | Evidence |",
          "| --- | --- | --- | --- | --- |", "| AUD-021-SEC001 | Open | Not fixed | Not run | Original finite-stream reproduction |",
          "| AUD-021-DOC001 | Open | Not fixed | Not run | Six rendered passport comparisons |", "",
          "No source fix was authorized or made. Prior AUD-019/020 records remain unchanged; this report does not invent new IDs for their existing findings.", "",
          "### Informational observations and recommendations", "",
          "Monitor the unmaintained dependency warnings through upstream releases; do not treat advisory scans as integration review. Keep the finite stream test as a production regression when fixing the byte ceiling. Use freshly verified bundles for distribution rather than earlier files left in local release directories.", "",
          "### Assessment and limitations", "",
          "One medium availability defect and one low metadata defect are open. Fix the availability defect before publishing the affected Bitcoin/Ethereum connected tools. The fresh default build, browser behaviors and tested offline workflows passed the stated checks; this is not a blanket safety certification.", ""]
lines += ["- " + value for value in limitations]
(AUDITS / (BASE + ".md")).write_text("\n".join(lines) + "\n")
print("Assembled AUD-021: one medium and one low open finding, 32 coverage rows and retained actual commands.")
