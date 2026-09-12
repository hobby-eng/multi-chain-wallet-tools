# Audit remediation — 2026-09-12

Reviewer/implementation assistant: OpenAI Codex (GPT-6 family; exact service snapshot not exposed).
Date: 2026-09-12 (evidence timestamps in UTC). Application: 0.1.4, unpublished local state.
Branch: `hobby-eng-psbt-inspector-v4`.
Target: `hobby-eng-studious-tribble`, based on `ea5d4215ccbf355dd86f1c9928e213df1e23d186` plus the existing local changes.

Changes are applied to the current implementation. Earlier `super-broccoli` fixes were reviewed for intent and regression evidence; whole application files were not replaced with old versions.

Original findings: [independent audit](2026-09-12-01-initial-audit.md). This record concerns first-party fixes and integration tests, not a dependency source audit. Existing uncommitted work was retained; no commit, push or release was made.

## Changes

- F01: validate public-key length and curve point in the actual Miniscript context before compilation; retain legacy uncompressed-key support where the descriptor permits it.
- F02: discard Inspector message verification after edits, network/chain changes, or Clear.
- F03–F04: validate known PSBT map fields and mandatory/version-specific combinations; bind previous transactions to input outpoints and reject conflicting UTXO forms. Supplied fee values are explicitly not chain-verified.
- F05/F14: validate descriptor arity, binary Taproot trees, key contexts, origins, wildcard/multipath bounds and script wrapper limits. Compile supported ordinary/MuSig Taproot trees and serialize 32-byte-key HASH160 fragments.
- F06–F09: reject mixed-case Platform addresses, unknown/wrong explorer networks and mismatched Core summary addresses; validate whole history pages and preserve confirmed offsets when pending rows are prepended; deduplicate overlapping L1 balances without mixing credits with duffs.
- F10: reject timestamp values entered as absolute block heights.
- F11: retain CoinJoin results in the visible result section; prevent reentrant BIP38 start while the password input is disabled. Cancel queued BIP85 refresh when an explicit derivation/clear supersedes it.
- F12: derive Docker copy-out manifest paths from the current edition metadata.
- F13/F15: correct independent test setup/type imports/oracle assumptions, update browser expectations for the current UI and clarify BIP45 hierarchy and support boundaries.

## Reference-test corrections

The earlier audit prose overstated two oracle observations. The saved Go oracle output for uncompressed `wpkh()` normalizes to a compressed-key address rather than rejecting the input; BIP382 is the rejection authority. Its oversized origin handling is also permissive. Regression tests must not treat that permissiveness as a specification.

The 24 BIP373 cases comprise **14 valid and 10 invalid cases**, not 24 invalid cases. The pass count was correct; the description was not. Both groups are now exercised in the repository suite.

## Validation

Validation ran against the original current working tree, not the earlier audit copy. Full browser matrices ran after functional changes; subsequent browser runs selected only failures and the related Firefox sequence.

| Check | Result |
| --- | --- |
| Full Vitest run, one worker | **76 files / 919 tests passed** |
| TypeScript `--noEmit` | Passed |
| Project metadata/facts and reproducible container configuration | Passed |
| Build all four tools in both editions, using checked-in WASM | Passed |
| Eight standalone artifact/edition/CSP checks | Passed |
| Direct `file://` acceptance, Chromium 151.0.7922.34 and Firefox 153.0 | **16/16 passed** |
| Extended regression matrix | Initially **27/30 passed**; see qualifications below |
| Chromium scanner boundary rerun after probe correction | **2/2 passed** |
| Isolated Firefox BIP85 rerun | **1/1 passed** |
| Firefox BIP38 → BIP85 sequence rerun | **2/2 passed** |
| Read-only live Dash Core and Platform checks, mainnet and testnet | **4/4 passed** |
| `git diff --check` | Passed |

The independent Inspector suite includes 133 official PSBT cases across BIP174/370/371/373, public BIP390 output fixtures, and adversarial regressions for schema/UTXO binding, descriptor origins, key contexts and Taproot trees. These supplement existing independent cryptographic and address vectors. Oracle permissiveness is not substituted for normative BIP rules.

Two initial Chromium failures were caused by the test explicitly calling `indexedDB.databases()` in the opaque sandbox: Chromium emits an additional undefined pageerror although the SecurityError is caught. A separate minimal reproduction located that event at this probe. The harness now records only this specific event during the opaque IndexedDB probe separately; all other page errors remain failures. CSP, denied storage, blocked network and blocked parent access assertions remain enforced. Application security policy was not relaxed.

**Unresolved browser observation:** Firefox crashed at `page.reload` in the full BIP85 run after derivation/signature/clear checks. The isolated replay and the preceding BIP38 → BIP85 sequence both passed. This is not proof of a fix. Browser diagnostics contain Juggler `removeProgressListener` errors but do not establish the cause of the crash. Keep this stability issue open for a headed run or a captured Firefox crash dump; do not report the original full regression matrix as 30/30 green.

The earlier Rust/WASM audit results apply to the unchanged module. A fresh canonical Docker/WASM rebuild was not performed in this remediation: the available local wasm-bindgen CLI is 0.2.127 whereas the project pins 0.2.128. Container configuration checks do not prove byte-for-byte container reproducibility.

Machine-readable outcomes and artifact SHA-256 hashes: [validation record](2026-09-12-02-remediation-audit.json). Detailed local logs and browser evidence: `/tmp/wallet-independent-20260912/evidence/remediation-*`. These temporary evidence paths are not release assets.

No full-suite rerun is silently counted as passing after a failure: the initial failure and targeted reruns remain separate in the validation record.

## Boundaries

No first-party MuSig signing/nonce coordinator was added. Unknown/proprietary PSBT records remain inspectable. Structurally accepted PSBT data is not proof of valid signatures or spendability. The existing upstream WASM is unchanged; a new upstream dependency audit, live funded transaction and fresh canonical Docker build are not implied by these source fixes.
