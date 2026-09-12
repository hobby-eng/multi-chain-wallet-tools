# Independent-audit remediation verification — 2026-09-12

## Identity, snapshot and scope

- **Reviewer:** OpenAI Codex using GPT-6 Astra in the Codex desktop app. The exact hosted model snapshot is not exposed by the client.
- **Verification date:** 2026-09-12, completed at 13:54 UTC (16:54 Europe/Moscow).
- **Repository:** `/home/user/.copilot/repos/copilot-worktrees/derivationtool/hobby-eng-studious-tribble`, branch `hobby-eng-psbt-inspector-v4`.
- **Verified source commit:** `d978dd4de68e6b51743d8ce0f01fcd6128d88553`, version 0.1.4 (unreleased). The working tree was clean when the canonical build and browser suites started.
- **Purpose:** verify the corrections made after `2026-09-12-04-independent-audit`, including IA-01 through IA-06, the audit's code-quality recommendations, browser lifecycle handling, build provenance and documentation status.
- **Included:** first-party TypeScript and Rust, stored public vectors, build and release tooling, generated Dash Orchard integration bytes, eight standalone HTML artifacts, compile-time edition boundaries, and Chromium/Firefox `file://` behavior.
- **Excluded:** third-party dependency source audit, a formal cryptographic proof, real-funds operations, hardware wallets, real Bitcoin Core or Dash Core import/sign/spend round trips, a complete mainnet Orchard scan, and mutable live-provider truth.

This is remediation evidence produced by the same development workflow that made the corrections. It is not a third-party security certification.

## Result

All addressed findings passed their permanent regression tests and the complete canonical verification command. All eight final HTML artifacts opened and completed their acceptance flows in both browsers. No release blocker was reproduced in the corrected snapshot.

The result does not establish that the applications are free of every defect. The residual boundaries in the final section remain material, especially for real-wallet interoperability, provider completeness and cryptographic-specialist review.

## Finding disposition

| Prior finding | Status at `d978dd4d` | Evidence |
| --- | --- | --- |
| **IA-01 — multisig consensus limits** | **Corrected and regression-tested.** A shared Inspector limit module now enforces bare multisig 3-key policy, `CHECKMULTISIG` 20-key consensus, Tapscript `CHECKSIGADD` 999-key consensus, 520-byte element, 10,000-byte script, locktime/sequence and Taproot-tree limits. | `apps/psbt-inspector/tests/consensus-limits.test.ts`: accepts 20/rejects 21 `multi` and `sortedmulti`; accepts 999/rejects 1000 `multi_a` and `sortedmulti_a`; accepts 3/rejects 4 bare keys. |
| **IA-02 — Firefox worker termination crash** | **Corrected and browser-tested.** The shared derivation client now has an explicit readiness promise and waits for the worker's `ready` message before termination. The UI exposes initialization state and preserves cancellation/revision behavior. | Unit lifecycle tests plus `worker-readiness` in both editions and both engines; the former Firefox Clear/Cancel/tab-switch crash no longer occurs. |
| **IA-03 — contradictory sorted multisig presentation** | **Corrected.** Rows come from the parsed expression and distinguish supplied order, BIP67 sorting and x-only Tapscript sorting. | Exact row assertions for `multi`, `sortedmulti`, `multi_a` and `sortedmulti_a` in `consensus-limits.test.ts`. |
| **IA-04 — unchecked PSBT relationships** | **Corrected for the deterministic relationships selected by the audit.** The Inspector checks BIP327 KeyAgg, MuSig participant membership, strict-DER partial signatures, BIP32 depth, `MAX_MONEY`, script commitments, Taproot internal-key consistency and PSBTv2 locktime compatibility. Per-input/global rows now say `verified`, `failed` or `not verified`. | Nine adversarial/positive tests in `psbt-relationships.test.ts`, including stored official BIP174/BIP370 cases. Unknown transaction-modifiable flag semantics remain explicitly unverified. |
| **IA-05 — Dash Inspector artifact gate omission** | **Corrected.** The Dash Community Inspector is part of the compile-time artifact gate with reviewed shared-decoder exceptions and rejection of Bitcoin-only providers, adapters and controls. | Dash profile tests and final `verify-artifact-profiles` pass for all four Dash Community artifacts. |
| **IA-06 — conformance assertions weaker than their labels** | **Corrected.** Stored Core Miniscript cases now assert compiled scripts when supplied and compare analysis flags; official PSBT cases use expected validity and reason families; supported BIP341 multi-leaf cases are exercised. The stale failed results file was removed. | `crypto-conformance.test.ts` contributes 409 passing cases inside the final suite. |
| Pending-only DashScan pagination concern | **Corrected and regression-tested.** A pending row included in a provider total no longer creates a false pagination mutation error. | `history-pagination.test.ts` pending-only case and all pagination cases pass. |
| Reproducible-build provenance gap | **Corrected.** Both Node and shell entry points pass the real Git commit and dirty state to the isolated build. Static verification fails if the shell binding is removed. | Final record identifies commit `d978dd4d…`, `dirty: false`, and command `pnpm verify`. |

## Canonical verification

Command: `./tooling/build-reproducible.sh`

The Linux/amd64 container used the immutable base-image digest and the pinned project toolchain: Node 24.20.0, pnpm 11.25.0, Rust/Cargo 1.98.1, wasm-bindgen 0.2.128, TypeScript 7.0.2, Vitest 5.0.0 and Playwright 1.62.1. Dependency resolution was locked. The final verification layer ran with network access disabled after dependencies and pinned Rust sources had been fetched.

Results:

- Project metadata and current documented facts passed.
- TypeScript compilation passed.
- **84 Vitest files and 1,071 tests passed; zero failures.**
- Independent Bitcoin, Ethereum and Dash derivation comparisons, official BIP/Miniscript/PSBT fixtures, BIP13/DIP13, BIP38, BIP85, BIP327/341/370/371/373/380/383/390 and boundary suites passed where applicable to implemented features.
- Rust: **12 passed, 0 failed, 1 ignored**. The ignored case is a fixture-capture helper; it is not an acceptance assertion.
- Dash Orchard stream, generated-WASM boundary, encrypted-note recovery, viewing capability separation, key clearing and fixed public vectors passed.
- The canonical WASM rebuild byte-matched the committed generated files.
- Two same-machine HTML builds were byte-identical.
- Both edition profile gates and both flat release-bundle verifiers passed.
- `dist/verification-record.json` passed schema/content verification. SHA-256: `c43c64672a4ca547f265d50282454ff1738784857e9274a4afc987e199190be8`.

## Final artifact hashes

| Edition | Artifact | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| Multi-Chain | Wallet Activity Viewer | 10,979,591 | `c3134c8e87d335abc64d2f5aea8cf1b66f4ae6a09a6457f53286b10f5c8f0dbe` |
| Multi-Chain | Wallet Discovery Scanner | 11,058,247 | `effbcc522faa203f074ec09247a554e13fead2d107241fe4e5378d15b1975647` |
| Multi-Chain | Wallet Key Derivation Tool | 12,819,809 | `3c67602b573852b11bb4792cc0eb6b8a41766465e6d96772de5a56b4cb548028` |
| Multi-Chain | PSBT & Multisig Inspector | 12,410,659 | `c5cfbf2f919dc8714f4b19d3ab5450cc25abaa2f5f43240de1f21f2fcfdee5a1` |
| Dash Community | Wallet Activity Viewer | 10,956,975 | `6c7d828d6ad011547335068857026f70213a04e4109a3aaf0546b73df4bf8b1b` |
| Dash Community | Wallet Discovery Scanner | 10,999,719 | `de6c5d5d44592254a953fcef84babe8d33009813a52e5e14f18296504973d4b3` |
| Dash Community | Wallet Key Derivation Tool | 692,577 | `1b206e4132db77948f11571dc0d5b06b6e1eda543180f6a2156374c7d540a1fe` |
| Dash Community | PSBT & Multisig Inspector | 353,855 | `3fdabb7bc09c8586131dfdf181fe6ed0ccc8f4e8b59743594853f541b2d8c811` |

## Browser verification of the exact artifacts above

- **Direct standalone acceptance:** 16/16 passed: eight artifacts in Chromium 151.0.7922.34 and Firefox 153.0. Evidence directory: `/home/user/.copilot/repos/copilot-worktrees/derivationtool/hobby-eng-studious-tribble/test-results/browser-files/2026-09-12T13-51-41.344Z`.
- **Extended regressions:** 38/38 passed in the same engines. Evidence directory: `/home/user/.copilot/repos/copilot-worktrees/derivationtool/hobby-eng-studious-tribble/test-results/browser-regressions/2026-09-12T13-53-05.244Z`.
- The scenarios cover direct `file://` startup, desktop/mobile layout and bounded footer whitespace, CSP injection rejection, storage emptiness, the opaque Discovery Vault, expected request allowlists, pagination, stale-result invalidation, descriptor follow-up, PSBT verification revision, worker readiness and immediate termination, CoinJoin, BIP38/message workflows and BIP85 child signing.
- The expected CSP violation messages produced by deliberate injection/network probes were recorded as test evidence and did not count as application errors.

The browser evidence directories are intentionally Git-ignored because they contain large screenshots and machine-specific absolute paths. This report records sanitized paths and the artifact hashes bind those runs to the canonical outputs.

## Code and documentation status

- Consensus/policy limits are centralized in `apps/psbt-inspector/src/consensus-limits.ts` and consumed by parsing, compilation and tests.
- Worker readiness is expressed by one shared client contract used by both editions; it is browser-independent application logic rather than a Firefox-only workaround.
- Verification claims now distinguish source/module tests, native Rust/WASM checks, artifact gates, deterministic builds, real-browser acceptance and mutable live-provider observations.
- A machine-readable verification record is produced only after its declared check group succeeds. Release workflows additionally request GitHub OIDC provenance for published assets.
- Historical audit records retain their original findings and totals. They are evidence for their own snapshots, not the current one.

## Residual limitations

1. No independent cryptography specialist has certified the design or implementation. Public vectors and differential tests reduce integration risk but are not a proof of correctness.
2. The Inspector validates structures and selected deterministic relationships. It does not validate every ECDSA/Schnorr signature, reconstruct every Taproot commitment for every possible PSBT, coordinate MuSig signing or manage nonce lifecycle. The UI marks relationships outside its proof scope as not verified.
3. Descriptor multipath support remains intentionally bounded to the documented receive/change form; arbitrary-length multipath alternatives are not implemented.
4. Real Bitcoin Core and Dash Core descriptor import, signing and spending round trips are not automated acceptance gates. Users must verify valuable policies and addresses with the target wallet before funding them.
5. Live provider results can lag, omit data, change schemas or throttle requests. The deterministic suite validates parsing, pagination, consistency and fail-closed behavior with public fixtures; it cannot prove current external index completeness.
6. The pending-only DashScan correction covers the two observed/documented response shapes but lacks an authoritative immutable upstream pending-only fixture.
7. A complete mainnet Dash Orchard cold scan and real funded-note lifecycle were not performed. Stored official/fixed fixtures exercise the cryptographic and accounting boundary without exposing user data.
8. Dependency source review and broader software supply-chain review remain outside this report. Exact locks, hashes, policy checks and GitHub provenance make changes detectable; they do not prove third-party code safe.
9. Browser, OS, extension, firmware or build-host compromise remains outside the application security boundary. JavaScript secret erasure is best effort, and crash dumps, swap and clipboard history may retain copies.

## Release assessment

The corrected source and generated artifacts are suitable for release-candidate review under the documented scope. Publication should still wait for the normal pull-request checks and the release workflow's own build-provenance attestation. No tag, push, merge or release was performed as part of this verification.
