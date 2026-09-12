# Independent audit of the local wallet tools — 2026-09-12

> Historical pre-remediation findings. See [the remediation record](2026-09-12-02-remediation-audit.md) for subsequent changes, test results and corrections to two oracle descriptions. External evidence paths below identify the original review environment.

## Audit identity and scope

- **Reviewer:** OpenAI Codex, GPT-6 family as identified by this session's instructions. The exact service-side model snapshot/build identifier was not exposed; no more specific identifier is asserted.
- **Date:** 2026-09-12; evidence timestamps are UTC. Operator timezone: Europe/Moscow.
- **Application version:** 0.1.4, local development state, not a release certification.
- **Actual source:** `/home/user/.copilot/repos/copilot-worktrees/derivationtool/hobby-eng-studious-tribble`.
- **Branch:** `hobby-eng-psbt-inspector-v4`.
- **HEAD:** `ea5d4215ccbf355dd86f1c9928e213df1e23d186`.
- **Snapshot:** 2026-09-12T03:18:36.425942+00:00; 399 tracked/untracked source files fingerprinted. HEAD alone does **not** identify this code: there were 46 modified tracked files and 55 untracked files.
- **Scope:** first-party implementation and integration of Key Derivation, Activity Viewer, Discovery Scanner, and Bitcoin/Dash PSBT & Multisig Inspector; both Multi-Chain and Dash Community artifacts; documentation, build configuration, and test credibility.
- **Method:** source review, fresh upstream reference acquisition, independent adversarial/differential harnesses, native/WASM tests, direct `file://` browser tests, and read-only live Dash network smoke checks.
- **Excluded:** a security audit of the internals of all downloaded dependencies or the upstream Orchard codebase; mainnet transaction broadcasting, funding test outputs, production wallet imports, and release publication.

**No original source, documentation, Git history, branch, or release was changed.** Tests and new reproduction harnesses ran in `/tmp/wallet-independent-20260912`, using a copy of the actual working tree, including uncommitted changes. The report and evidence are external to the repository. Test workarounds described below were confined to this audit copy/harness.

## Assessment

**Do not consider this snapshot ready for real-fund use of the new custom Tapscript constructor or for a release advertised as fully verified.** One confirmed High-severity defect can produce a script whose signature requirement differs fundamentally from the displayed analysis. Several Medium findings affect transaction interpretation, stale verification results, network-response trust, pagination, accounting, and usable UI behavior. A repeatable Firefox crash in BIP85 child-wallet derivation is also unresolved.

The previous report's custom Tapscript concern is reproducible in the latest local tree, including both browsers. Conversely, its Deriver signing-dialog revision fix is present. The original repository tests do not establish a clean result: one suite fails before its 327 cases run, TypeScript reports three errors, and browser suites contain both actual application failures and obsolete expectations.

There is also substantial positive evidence. Selected official BIP32, BIP340, BIP341, BIP327 and BIP328 vectors pass; native Rust and checked-in WASM tests pass; the scanner can execute/cancel/restart public-key and synthetic seed scans in both browsers; all eight live Dash smoke checks pass; both editions build and their standalone artifact checks pass. These results **do not cancel the findings below**.

No secret-exfiltration path was demonstrated in the reviewed flows. That is narrower than a guarantee that no such path exists. The connected tools intentionally query public providers; only the Deriver, Inspector, and scanner's isolated secret frame have a no-network boundary.

## Repository selection and carried changes

The older Documents checkout is now `/home/user/Documents/derivationtool23`; its old pathname no longer exists. The latest worktree's Git metadata points into that renamed checkout. Some other worktrees still have stale `.git` paths. They were not repaired or used as the audit target.

The Inspector worktree contains five commits above its shared main baseline `2afe70a53723de73fe94067dc784a3548e158728`. The Inspector and several new feature modules also exist as **untracked files**, so a push of HEAD alone would not preserve the audited implementation.

Nine commits on `codex/security-consistency-audit-20260911` through `704b666d3a0da835d0aa80c4cff8fa8f9789f29e` are not in the target branch's ancestry/equivalent patch history. **This is not proof that their fixes were not copied manually.** Actual source and reproductions were checked separately:

| Prior change | Current evidence |
|---|---|
| Mixed-case DIP18 rejection | Absent; mixed-case input is accepted, F06. |
| Cross-family L1 balance deduplication | Absent; duplicated value is summed twice, F07. |
| Full Dash history page validation | Absent; malformed suffixes/metadata accepted, F08. |
| Resource/network response binding | Address binding and strict network identity remain deficient, F09. |
| Pending-row pagination handling | Confirmed record can be skipped, F08. |
| Edition-specific Docker copy-out paths | Old flat `release/SHA256SUMS` assumption remains, F12. |
| Scanner execution browser coverage | The older execution harness was run externally against current artifacts: all four combinations passed. The current simple file suite lacks equivalent execution coverage. |
| Deriver signer revision fix from the supplied report | Present; do not re-report that resolved defect. Inspector verification has a distinct outstanding race, F02. |

The old commits still exist as Git objects/references. They were not lost by this audit. `evidence/latest-commits.txt`, `prior-audit-cherry.txt`, `original-status.txt`, and `source-manifest.json` preserve the inventory.

## Findings

Severity describes demonstrated impact, not the number of failed test cases. Suggested corrections are recommendations only; none were applied.

### F01 — High: custom Tapscript accepts the wrong public-key type and reports a signature requirement it does not enforce

**Locations:** [custom-miniscript.ts:34](../../apps/psbt-inspector/src/custom-miniscript.ts#L34), [custom-miniscript.ts:61](../../apps/psbt-inspector/src/custom-miniscript.ts#L61), [miniscript-engine.ts:131](../../apps/psbt-inspector/src/miniscript-engine.ts#L131).

The application trusts Miniscript analysis without first enforcing the cryptographic key type for the selected context. A compressed 33-byte SEC key is accepted inside Tapscript `multi_a`, compiled literally, and shown as sane and requiring a signature.

Public deterministic reproduction, using the secp256k1 generator:

```text
multi_a(1,0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798)
```

Actual leaf bytes:

```text
210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ac519c
```

Actual output:

```text
address: bc1p0exkm5mzk55f545s5pfdk0z9aw62kwa92k0e55zm2s7t4dkyg2zqt8der5
scriptPubKey: 51207e4d6dd362b5289a5690a052db3c45ebb4ab3ba5559f9a505b543cbab6c44284
```

The leaf pushes **33 bytes**, then `OP_CHECKSIG 1 OP_NUMEQUAL`. Under current BIP342 consensus rules, a nonempty public key with a length other than 32 uses the unknown-key-type semantics: a nonempty signature satisfies the signature opcode without Schnorr verification. A nonempty placeholder witness can therefore satisfy this leaf's signature check. Ordinary relay policy can discourage this key type; relay policy is **not** a cryptographic ownership requirement. [BIP342](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0342.mediawiki).

A second input, `multi_a(1,` followed by 32 bytes of `ff` and `)`, is also labelled sane and emits an address, although that x-only value is not a valid curve point. This is the opposite failure mode: an unusable signature path, with a deliberately unspendable NUMS internal key.

**Evidence:** `evidence/independent-probes.json`, `browser-independent.json`, and both `*-custom-tapscript.png` screenshots. Reproduced in Chromium and Firefox. This audit did not fund or broadcast a spend; consensus interpretation is derived from the exact emitted bytes and the pinned BIP/Core interpreter rules.

**Recommendation:** validate every substituted key after derivation, in its exact script context, before compilation and before any “sane/signature required” result. Require valid 32-byte x-only points for these Tapscript fragments. Do not treat compiler type analysis alone as cryptographic key validation. Add both unsafe-key and invalid-point regressions.

### F02 — Medium: Inspector displays a verification result for an obsolete message, including after Clear

**Locations:** [app.ts:575](../../apps/psbt-inspector/src/app.ts#L575), [app.ts:1292](../../apps/psbt-inspector/src/app.ts#L1292).

`verifyMessageSignature()` awaits asynchronous verification and then renders unconditionally. Input edits and Clear do not invalidate the operation. A valid public fixture is submitted; before the promise resolves, the message is changed. The visible form contains the new message while the verdict says “VALID … exact message” for the old one. Clear can also be followed by the old result reappearing.

**Reproduction:** `node harness/browser-probes.mjs`. It submits a public Dash message/signature fixture and dispatches an input change or Clear in the same browser turn. All four browser/edition combinations reproduce it.

**Impact:** misleading proof-of-control/message verification. This does not show that the underlying cryptographic verifier accepts the changed message; it shows that the UI binds a correct old verdict to the wrong visible input.

**Recommendation:** capture an immutable request plus revision; invalidate on every relevant edit, network/chain switch, and Clear; render only if the captured revision remains current. Keep this separate from the already-fixed Deriver signer race.

### F03 — Medium: PSBT parsing is substantially more permissive than the advertised versions' field schemas

**Locations:** [psbt.ts:143](../../apps/psbt-inspector/src/psbt.ts#L143), [psbt.ts:273](../../apps/psbt-inspector/src/psbt.ts#L273).

The generic map reader correctly rejects duplicate raw keys and several framing errors. However, most recognized field types are not validated for key-data size, value shape, applicability to PSBT version, or required combinations.

Reproduced examples:

- PSBTv0 with a v2-only global field is accepted.
- PSBTv2 without transaction version, previous transaction ID/output index, and output script can be accepted if counts and output amount are supplied.
- A 31-byte Taproot internal key, a 63-byte Taproot signature, and a one-byte control-block key are accepted as supplied map fields.
- Known fields with malformed key data can bypass `pair()` lookup and remain uninterpreted.
- An official valid zero-input unsigned-transaction vector is rejected because transaction parsing mistakes its count bytes for a witness marker.

Fresh official valid/invalid PSBT corpora produced 12 BIP174, 19 BIP370, and 11 BIP371 classification mismatches. These are **42 vector mismatches, not 42 distinct vulnerabilities**. Some are permissive decoding, one is valid-data rejection, and they must be corrected against each vector's stated requirement. [BIP174](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0174.mediawiki), [BIP370](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0370.mediawiki), [BIP371](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0371.mediawiki).

**Evidence:** full public Base64 reproductions in `independent-probes.json`; named upstream cases in `official-matrix.json` and the archived BIP files.

**Recommendation:** separate tolerant raw inspection from validated PSBT status. Apply per-version/per-scope field schemas, preserve unknown/proprietary data without calling it validated, and identify invalid known fields explicitly. Decoding alone must never imply safe signing or successful Core import.

### F04 — Medium: displayed PSBT fee is calculated from unbound or conflicting UTXO claims

**Locations:** [psbt.ts:229](../../apps/psbt-inspector/src/psbt.ts#L229), [psbt.ts:312](../../apps/psbt-inspector/src/psbt.ts#L312), [app.ts:492](../../apps/psbt-inspector/src/app.ts#L492).

The non-witness previous transaction is read without checking that its hash equals the input's referenced transaction ID. If witness and non-witness UTXOs conflict, the witness value takes precedence without a consistency error.

Synthetic examples produce a known fee of 100 from an unrelated previous transaction, or 1,100 after adding a conflicting witness value of 2,000 to an input whose supplied previous transaction output is 1,000 and spending output is 900. All values are atomic units, using public constructed transactions.

**Impact:** a malicious/inconsistent PSBT can influence a seemingly authoritative fee display. No signing or broadcasting occurs in this Inspector, which limits impact.

**Evidence:** `unbound-previous-transaction-fee` and `conflicting-witness-and-nonwitness` in `independent-probes.json`.

**Recommendation:** bind non-witness transaction hash and output index, compare both UTXO forms when present, validate relevant script commitments, and label unverified witness-only values and derived fees as supplied claims.

### F05 — Medium: descriptor validation permits invalid contexts and malformed tree/multipath syntax

**Locations:** [descriptor-key.ts:24](../../apps/psbt-inspector/src/descriptor-key.ts#L24), [descriptor-key.ts:69](../../apps/psbt-inspector/src/descriptor-key.ts#L69), [descriptor.ts:350](../../apps/psbt-inspector/src/descriptor.ts#L350), [descriptor.ts:483](../../apps/psbt-inspector/src/descriptor.ts#L483).

Confirmed examples include:

- `wpkh()` with a valid **uncompressed** 65-byte point produces an address, whereas the independent Go descriptor implementation rejects it; BIP382 requires compressed keys.
- `rawtr()` with that point produces `OP_1 PUSH32` followed by 65 key bytes, an incorrectly constructed P2TR script. The UI does not produce a valid address for those bytes, but the compiled script itself should have been rejected.
- `tr()` trees with one or three children are accepted; an extra top-level third argument can be ignored in interpretation.
- Two multipath steps, such as `xpub/<0;1>/<0;1>/*`, are accepted despite BIP389's single-tuple restriction. The public BIP32 vector xpub is supplied by the reproduction harness.
- The descriptor/raw-script decoding paths can construct a P2SH address for a redeem script exceeding the 520-byte pushed-element limit. The separate policy builder correctly rejects the oversized case; do not confuse the two entry points.

**Evidence:** `independent-probes.json`, `size-probes.json`; malformed-threshold/context cases also appear in the existing oracle suite after its setup workaround. [BIP382](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0382.mediawiki), [BIP386](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0386.mediawiki), [BIP389](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0389.mediawiki).

**Recommendation:** use one context-aware parsed representation for validation, expansion, compilation, and interpretation. Reject invalid arity/key forms before output construction. Make “structurally decoded” distinct from “compiled and spendable under this wrapper”.

### F06 — Medium: mixed-case Dash Platform addresses are normalized before checksum validation

**Location:** [public-address.ts:127](../../packages/dash-network/src/public-address.ts#L127).

The decoder lowercases before Bech32m decoding. Public synthetic input `daSh1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs` is accepted as the lowercase address. Mixed case is invalid, even when the all-lowercase spelling has a valid checksum. This weakens validation of copied/malformed payment addresses.

**Evidence:** `dash-probes.json`, case `platform-case`. Lowercase and all-uppercase valid forms were tested separately.

**Recommendation:** reject mixed case before normalization. This prior audit fix is not present in the current source.

### F07 — Medium: the Dash discovery overview double-counts an address found in overlapping L1 families

**Location:** [summary.ts:5](../../apps/discovery-scanner/src/coins/dash/summary.ts#L5), especially line 29.

Each section is summed independently, then Core/Legacy/CoinJoin/provider holdings are added. A synthetic address with 100,000,000 duffs appearing in both Core and Legacy yields **2 DASH**, not 1. The funded-resource count is also inflated.

This is **not a credits-versus-duffs conversion error**: the conversion constants and separation of Platform/Orchard credits from Core duffs are correct in this path. The defect is resource identity/deduplication across overlapping scan families.

**Evidence:** `dash-overlap` in `independent-probes.json`.

**Recommendation:** deduplicate L1 resources by chain/network/canonical address before aggregate totals, while preserving per-path findings. Do not collapse distinct Platform, Identity, and Orchard resources merely because their displayed labels resemble each other.

### F08 — Medium: Dash Core history pagination can skip confirmed records and accepts incomplete page validation

**Location:** [public-address.ts:265](../../packages/dash-network/src/public-address.ts#L265), particularly lines 285–300.

Only `items.slice(0, remaining)` is parsed/validated. Missing total metadata is tolerated. Oversized confirmed pages and malformed records beyond the retained prefix can therefore escape validation. When pending rows are prepended to a page-number API's confirmed rows, truncation to the display limit can discard a confirmed record; the next page advances past it.

A deterministic 150-record probe returned 150 displayed IDs including a pending item while omitting a confirmed ID at the page boundary. Other probes demonstrate acceptance of missing totals, an oversized confirmed page, and a malformed suffix.

**Evidence:** `dash-probes.json`, IDs `missing-total`, `oversized-confirmed-page`, `garbage-after-display-prefix`, and `pending-offset`; complete mock responses are in `harness/dash-probes.mjs`.

**Recommendation:** validate every returned item and mandatory pagination metadata; model the provider's confirmed/pending pagination contract explicitly; apply display limits after that validation/normalization. Do not infer completeness from displayed item count alone.

### F09 — Medium: some Dash explorer responses are not strictly bound to the requested resource/network

**Locations:** [public-address.ts:265](../../packages/dash-network/src/public-address.ts#L265), [platform-address-history.ts:100](../../packages/dash-network/src/platform-address-history.ts#L100), [platform-identity-history.ts:527](../../packages/dash-network/src/platform-identity-history.ts#L527), [network-service.ts:250](../../apps/discovery-scanner/src/network-service.ts#L250).

The Core summary's returned address is not compared with the requested address. A fixture carrying another address is accepted and displayed under the requested one. Several Platform status checks treat “does not contain testnet” as sufficient proof of mainnet; missing or unknown network identifiers can pass that check.

**Impact:** provider mistakes or malicious responses can be attributed to the wrong resource/network. Passing live happy-path smoke tests cannot establish rejection of these adversarial responses. This finding concerns explorer metadata validation, not a demonstrated bypass of Orchard proof verification.

**Evidence:** `wrong-summary-address` and unknown-network cases in `dash-probes.json`; exact branching in the cited files.

**Recommendation:** require an explicit recognized network identity and bind returned resource identifiers wherever the response schema exposes them. Fail closed on missing/unknown identity metadata.

### F10 — Medium: an absolute “block height” can compile as a timestamp lock

**Location:** [policy.ts:107](../../apps/psbt-inspector/src/policy.ts#L107).

`lockKind: 'height'` accepts 500,000,000 and 1,700,000,000 and describes them as block heights. CLTV interprets values at or above 500,000,000 as time-based locks. The program can therefore describe a substantially different spending condition from the script it emits.

**Evidence:** `lock-height` in `independent-probes.json`. 499,999,999 was also tested as the boundary below the threshold.

**Recommendation:** enforce the height/time discriminator in both form and core validation. Relative-block range and rounding relative seconds to 512-second units behaved correctly in the reviewed path. [BIP112](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0112.mediawiki).

### F11 — Medium: two Deriver UI regressions hide or interrupt successfully requested operations

**CoinJoin:** [controller.ts:1371](../../apps/key-derivation/src/ui/controller.ts#L1371) hides the main result section whenever any feature tab is active, including CoinJoin, which needs that section. Both browsers and both editions contain generated rows and a successful derivation status while the result section remains hidden.

**BIP38:** [controller.ts:1727](../../apps/key-derivation/src/ui/controller.ts#L1727), [controller.ts:1819](../../apps/key-derivation/src/ui/controller.ts#L1819). Entering the password and pressing Enter in Chromium triggers the reproducible error “Superseded by a new BIP38 encryption request.” No encrypted rows remain visible. The change and Enter handlers share a reentrant start path, and the start routine disables the focused input before establishing the worker lifecycle. The same small two-key operation completes in Firefox. The event ordering is the likely mechanism; the browser-specific failure itself is confirmed.

**Evidence:** `deriver-browser.json`, screenshots, and the existing browser regression log. Public test seed/password only.

**Recommendation:** keep CoinJoin result rendering in the ordinary result path; guard/deduplicate an active BIP38 operation and test Enter/change/focus transitions. These observations do not establish a cryptographic BIP38 algorithm failure.

### F12 — Medium (build/reliability): reproducible Docker wrapper checks an obsolete output path

**Location:** [build-reproducible.mjs:56](../../tooling/build-reproducible.mjs#L56), also line 61.

The full-build copy-out wrapper expects `release/SHA256SUMS` under the extracted dist directory. Current release assets are generated under `multi-chain-edition/release/` and `dash-community-edition/release/`. The wrapper will reject a correctly generated edition layout before replacing local dist.

**Evidence:** static control-flow/path comparison, current generated bundle layout, and successful local edition-specific bundle verification. This is **not** a claim that a complete fresh Docker build was executed during this audit.

**Recommendation:** derive copy-out validation from the same edition manifest used to create bundles. Existing container-configuration checks do not catch this mismatch.

### F13 — Medium (verification/release): the uncommitted audit suite and canonical check are not runnable as delivered

**Location:** [crypto-conformance.test.ts:4](../../apps/psbt-inspector/tests/independent-audit/crypto-conformance.test.ts#L4), lines 18–19 and 110.

The test imports a non-exported root type, passes an incompatible WASM buffer type, and uses a Taproot result overload lacking the accessed property. TypeScript reports three errors. Its WASM relative path resolves to `node_modules` **above** the repository, so its `beforeAll` fails and 327 cases do not run.

A harness-only parent `node_modules` symlink allowed those tests to execute without source changes: **267 passed, 60 failed**. Failures combine real parser issues, explicitly unsupported compilation paths, and unreliable expectations. For example, one test assumes the Go oracle rejects an oversized origin step, but that oracle accepts it. Neither an AI-written test nor a second library is automatically correct.

The simple file browser suite also waits for a removed `#standard-path-details` control in the Deriver, causing four false failures. Independent basic derivation succeeds. The fuller browser suite reveals genuine CoinJoin/BIP38 failures but also has narrower verdict/error expectations and Chromium page-error issues described in the test section.

**Recommendation:** fix the harness and explicitly classify unsupported functionality before using a green test count as release evidence. Keep invalid-input tests anchored to normative source text, not merely another parser's behavior.

### F14 — Low / capability gap: several valid descriptor/Miniscript paths remain inspection-only or unsupported

**Locations:** [descriptor.ts:483](../../apps/psbt-inspector/src/descriptor.ts#L483), [musig-descriptor.ts:180](../../apps/psbt-inspector/src/musig-descriptor.ts#L180), [miniscript-engine.ts:127](../../apps/psbt-inspector/src/miniscript-engine.ts#L127).

Ordinary `tr()` script trees and MuSig descriptors with script branches are not fully compiled into output scripts by these entry points. Six fresh official BIP390 script-path expectations return no output script. The UI explicitly identifies compilation as unimplemented in relevant paths, so this is **not** evidence of an incorrectly computed Merkle root or tweak there.

Seven valid Bitcoin Core Tapscript Miniscript compilation cases fail in the application ASM serializer because `<HASH160(32-byte-key)>` is unsupported; its special case only accepts 66 hex characters. Validity/type analysis may succeed before serialization fails.

**Recommendation:** publish a precise supported-path matrix and implement missing output construction only with complete script/tree/control-block vectors. Keep unsupported output visibly unavailable.

### F15 — Low: a BIP45 documentation shortcut omits a meaningful derivation level

**Location:** [Inspector README:11](../../apps/psbt-inspector/README.md#L11).

“Legacy multisig commonly uses m/45'/0” is too abbreviated as user guidance. BIP45 has purpose, cosigner index, change, and address index; it does not use the BIP44 account layout. Explain the complete hierarchy and what the shown zero means. Also distinguish wallet-specific legacy Purpose-48 variants from universal BIP48 interoperability. [BIP45](https://github.com/bitcoin/bips/blob/bfc142f2b580a314c846dbce3c15c659c2b1d32d/bip-0045.mediawiki).

## Cryptographic and protocol coverage

An independent reference does not mean every result is independent of every dependency. The application uses Scure/Noble and BitcoinerLab; running those same libraries against official literals checks integration, not a separate implementation of their algorithms. Go/btcd via `btcutil-js` supplied an additional implementation for BIP32 derivation, selected descriptor/address comparisons, Taproot output keys, and sorted MuSig aggregation. It is also used elsewhere in the application for BIP322, so it is not independent of that feature's verifier.

| Requested area | Evidence and boundary |
|---|---|
| BIP32 | 17 official path/xpub results checked against both Scure and Go/btcd and freshly fetched literals, including leading-zero vectors. Synthetic aggregate child indices 0, 1, and 2³¹−1 also agree. Public hardened derivation is rejected in the reviewed parser. Not all theoretical HMAC failure branches were fault-injected. |
| BIP44/45/48 | Standard account/change conventions reviewed; existing Bitcoin/Dash derivation tests pass. BIP45 cosigner hierarchy is not interchangeable with BIP44 accounts. No exhaustive live-wallet import comparison for every hardware/software wallet. |
| BIP67; `multi`/`sortedmulti` | Supplied versus sorted order is explicitly represented; official/Core literals and existing Dash BIP67 tests pass for covered valid paths. Builder duplicate checks are present. Parser/size inconsistencies remain F05. |
| BIP68/112 | Relative units/range handling reviewed and tested by existing suites; height/time boundary defect F10. This audit did not mine timelocked transactions. |
| BIP174/370/371 | Fresh valid/invalid PSBT corpus plus independent malformed maps/lengths/fee probes. Significant schema gaps remain F03/F04. |
| BIP327/328 | Four official ordered KeyAgg results, three synthetic xpub vectors, independent sorted-aggregation comparisons, and invalid point/tweak/infinity checks pass. BIP390 sorts participants; generic BIP327 KeyAgg preserves ordering. Repeated participants are valid in some official KeyAgg vectors: repetition is not universally an error. |
| BIP340 | 19 official valid/invalid Schnorr verification vectors pass through Noble. This does not prove all UI-message binding, which fails F02. |
| BIP341 | Seven wallet vectors pass for output script/address, Merkle root where present, and exact control-block bytes. Go independently agrees on tweaked output keys. Application constructor validation still fails F01. |
| BIP342; `multi_a`/`sortedmulti_a` | Valid compilation literals exercised, but context validation fails F01/F05; some hash-key serialization fails F14. Full script execution was not independently performed for every emitted path. |
| BIP373 | All 24 official malformed-field cases in the downloaded corpus are rejected as expected. Additional 66-byte all-zero nonce and out-of-range partial scalar are retained by the field decoder. They are not thereby valid nonce/signature proofs. No first-party MuSig signing/session coordinator exists here, so nonce generation, persistence, consumption, and reuse prevention cannot be certified as an implemented workflow. |
| BIP380–386 | Checksums, origins, standard wrappers, keys, script trees, and wildcard paths reviewed against official texts and selected cross-implementation outputs. Malformed grammar/context acceptance remains F05. Generic `tr()` compilation is incomplete. |
| BIP388 | No complete BIP388 wallet-policy/template registration workflow was demonstrated. Treat as outside implemented support, not automatically conformant because descriptors can be parsed. |
| BIP389 | Two-branch multipath derivation exists; repeated tuple acceptance remains F05. Arbitrary multi-branch Cartesian expansion is not certified. |
| BIP390 | Five official expected outputs pass; six script-path outputs are not constructed; one private-key case intentionally excluded by public-only input policy. Sorted aggregation, aggregate derivation, and key-only tweaks have positive evidence; full script-path support does not. |
| Dash DIP9/13/17/18 and Orchard | Existing vectors/self-tests, independent dashhd DIP13 mainnet/testnet checks, Rust/WASM checks, shared stream checks, and live API checks pass. Mixed-case decoding, explorer binding, L1 pagination, and duplicate totals remain. |

The downloaded nonce-generation/aggregation/signing/tweak vector files are preserved as references. They were **not all executed**: the current first-party Inspector does not implement a MuSig signing lifecycle. Likewise no separate libsecp256k1 executable or Bitcoin/Dash full node was available for a third execution oracle. Core source/literals and the Go implementation were used where described; this is not three independently executed consensus engines.

## Dash networking, Orchard, privacy, and stale-state review

- Core atomic values and Platform/Identity/Orchard credits remain distinct. The reviewed aggregate conversion is 1 duff = 1,000 credits. The confirmed duplicate-total problem is an accounting identity problem, not a new unit conversion mismatch.
- The shared Orchard stream advances by aligned 2,048-action chunks. A short nonempty page is not treated as completion. It requires two empty confirmations, tracks proof revisions, revisits a changed partial tail, rejects decreasing proof heights, enforces bounded reconciliation/page counts, and disposes fetched pages in `finally`.
- Existing stream and ledger/WASM checks exercise shared-FVK streaming, note positions, commitment/nullifier association, incoming/outgoing viewing material, internal/external address handling, and wiping. Native Rust tests pass. This is evidence for the first-party boundary; it does not independently re-prove upstream cryptography or every production pool state.
- The scanner's network broker exposes bounded public-data methods; its secret frame uses `sandbox="allow-scripts"` without same-origin permission and `connect-src 'none'`. The parent verifies message source before handling frame export/height requests. Cross-frame `'*'` targets are used for opaque origins, not as a substitute for source checking.
- Tested secret frames could not read parent DOM or persistent storage and could not fetch. Unhashed injected inline scripts were blocked. Deriver and Inspector have no ordinary network access under their CSP. Viewer and scanner shell intentionally allow HTTPS.
- No first-party calls to localStorage, sessionStorage, IndexedDB, or cookies were found in the reviewed production source search. Browser snapshots were empty or denied by the opaque origin. This is not a guarantee against browser memory snapshots/extensions/OS persistence.
- Fresh provider fetches use `cache: 'no-store'`. The retained SDK instance map is not a reusable address-balance result cache. Ledger maps and request cancellation maps hold current operation state and should not be described as disk caching.
- Scanner execution/cancel/Clear/restart and synthetic batch flows passed in both browsers. Inspector message verification has a separate stale-result defect. Passing one utility's lifecycle tests does not prove the other utility's lifecycle.

## Documentation and consistency

Metadata synchronization, project-facts verification, and container configuration checks pass. Application/build metadata consistently identifies the current development version as 0.1.4 in the checked generated locations. Historical release references were not automatically classified as stale simply because their version differs.

A Markdown link inventory covered **25 documents and 88 parsed links**: no referenced local file target was missing. All **28 unique HTTP(S) destinations returned HTTP 200**, including the DashSync URL redirect to the current owner. HTTP success is not proof that every linked paragraph/anchor still has the intended meaning. Markdown heading fragments and every autolink embedded in arbitrary code/comments were not exhaustively validated.

The Inspector README appropriately warns that experimental outputs should not hold real funds. That warning is useful, but it does not resolve contradictory per-output safety claims such as F01. The BIP45 shorthand needs clarification, and unsupported compilation paths should be documented as a support matrix rather than implied by a list of BIP names.

## Tests and reproducibility

| Check | Result |
|---|---|
| Unmodified Vitest suite | **75/76 files pass; 555 tests pass, 327 skipped; suite exit fails** because independent-audit setup cannot load its WASM path. |
| TypeScript | **Fail: 3 errors**, all recorded in `evidence/typecheck.log`. |
| Metadata / project facts / container configuration | Pass. |
| Native Rust | **12 pass, 1 ignored** fixture helper. |
| Both startup self-tests, DIP13 differential, checked-in WASM vectors, shared Orchard stream | Pass. |
| Build all artifacts | **8/8 built**; original repository artifacts not replaced. |
| Standalone artifact checks | **8/8 pass**. |
| Local deterministic HTML build using checked-in WASM | Pass; both editions. |
| Local release bundles/checksums | Both editions pass; files created only in isolated copy, **nothing published**. |
| Existing simple `file://` browser suite | **12/16 pass**. Four Deriver cases fail on an obsolete selector. |
| Existing full browser regressions | **15/26 pass, 11 fail**; see classification below. |
| Additional scanner execution browser harness | **4/4 pass**: both engines and editions; public-key scans, cancellation/restart/Clear, and synthetic batch flow. |
| Independent browser probes | Inspector stale verification reproduced in **4/4** combinations; unsafe custom Tapscript reproduced in both engines; CoinJoin hidden in **4/4**; Enter-triggered BIP38 failure in **2/2 Chromium** combinations. |
| Live read-only Dash checks | **8/8 pass**: Core, Platform, Orchard, discovery × mainnet/testnet. |

The 11 failures in the full browser suite break down as follows:

- Four CoinJoin visibility failures: confirmed application defect F11.
- Two Chromium BIP38 encryption failures: independently reproduced F11.
- Two Chromium scanner boundary runs report `pageErrors: ['undefined', 'undefined']`; their actual CSP, blocked-fetch, parent isolation, and storage assertions passed. These errors occurred under the intrusive test setup and are **not evidence of a demonstrated isolation bypass**. Their exact source remains unresolved.
- Chromium BIP85 and Firefox Bitcoin BIP38-message runs time out waiting for the literal `INVALID` verdict after tampering. The Taproot follow-up confirms rejection through an error (`ErrTaprootSigInvalid`) rather than the expected label. The Firefox Bitcoin compact-message timeout was not independently resolved; neither timeout, by itself, proves that a bad signature verifies.
- The Firefox BIP85 run crashes a page while waiting for child results in the long suite. A short isolated follow-up is recorded separately; do not infer a cryptographic mismatch from a crashed target.

A short BIP85 follow-up repeated the **Firefox page crash** in a fresh browser run, so it remains an unresolved release-reliability blocker, not merely an assumed long-suite resource issue. The triggering steps are: enable BIP85, derive the public test child, open the child wallet, select BIP86, and derive one child address. The relevant entry point is `childWallet()` in the saved browser harness. No exact application root cause or corrupt address output was established before the target crashed.

In Chromium, that follow-up confirmed the expected child mnemonic/address, accepted the original signature, and rejected the tampered Taproot proof with `ErrTaprootSigInvalid`. It subsequently hit another harness assumption: `#clear-all` is not visible in the active feature view. Therefore the complete BIP85 clear/reload workflow is **not recorded as passing**. See `evidence/verifier-followup.log` and the follow-up browser report. The standalone Dash BIP38 round trip, wrong-password handling, reveal controls, Clear and reload **did pass in Firefox** in the original regression suite.

The fresh upstream matrix contains **277 passing checks, 55 mismatches, and one explicit exclusion**. Of the 55 mismatches, 42 are PSBT corpus classification differences, six are missing BIP390 script-path outputs, and seven are unsupported Tapscript ASM serialization cases. Counts describe vectors, not severity or root-cause counts. Additional adversarial/browser probes are recorded separately.

The pre-existing 327-case oracle suite, run after a **harness-only filesystem-path workaround**, yielded 267 pass / 60 fail. It is supplemental evidence, not the authority for classifying the findings.

The local HTML determinism check reused the checked-in WASM, which passed runtime vectors. A fresh pinned WASM rebuild could not proceed: the installed `wasm-bindgen` CLI is 0.2.127 while the project requires 0.2.128. An initial sandbox execution also encountered a cargo spawn restriction; an authorized retry established the actual version mismatch. Rust 1.98.1 native tests were available and passed. No compiler-version check was bypassed. **Fresh canonical Docker/WASM reproducibility remains unverified.**

Browser tests used isolated profiles and direct `file://` artifacts, without disabling CSP or weakening file-origin security. Chromium version was 151.0.7922.34; Firefox was 153.0 (the exact reported engine versions are preserved in the full regression report). No personal browser profile or user wallet input was used.

## Reproduction and evidence layout

The accompanying `evidence/` directory contains logs, JSON results, screenshots, original source fingerprints, and original Git status. `sources/manifest.json` records each downloaded official file's URL and SHA-256. `harness/` contains the independent probes. `browser-reports/` contains the complete generated browser reports/screenshots.

Key commands, from an isolated copy with the same pinned dependencies:

```bash
node node_modules/vitest/vitest.mjs run --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit
node tooling/build-html-profiles.mjs
node tooling/verify-artifact-profiles.mjs
node tooling/verify-browser-files.mjs
node tooling/verify-browser-regressions.mjs
node tooling/verify-reproducible-build.mjs --reuse-generated-wasm
```

Audit-specific probes were invoked from the parent audit directory:

```bash
node harness/build-api.mjs
node harness/probes.mjs
node harness/dash-probes.mjs
node harness/official-matrix.mjs
node harness/musig-negative.mjs
node harness/browser-probes.mjs
node harness/deriver-browser.mjs
node harness/scanner-execution.mjs
```

These harnesses expect a sibling `work/` copy and the pinned dependencies; they are not an installed test package. The saved source archive and manifest allow reconstruction. The browser harnesses use `PLAYWRIGHT_MODULE` to point to the available Playwright installation. Never substitute a personal browser profile or a real wallet seed.

Pinned primary reference set:

- [Bitcoin BIPs at bfc142f2](https://github.com/bitcoin/bips/tree/bfc142f2b580a314c846dbce3c15c659c2b1d32d): all requested BIP texts plus official Schnorr, Taproot, KeyAgg, synthetic derivation, and PSBT vectors.
- [Bitcoin Core Miniscript tests at f3fec67c](https://github.com/bitcoin/bitcoin/blob/f3fec67c3eeb27d5be1bc9d57ca737b74fcd762d/src/test/miniscript_tests.cpp) and the corresponding interpreter source.
- [Dash Core descriptor tests](https://github.com/dashpay/dash/blob/master/src/test/descriptor_tests.cpp); the downloaded content is SHA-256 pinned in the evidence even though this URL names a mutable branch.
- Existing pinned first-party Dash vectors and independent dashhd 3.3.3 comparisons; Scure/Noble, BitcoinerLab, and Go/btcd through btcutil-js as explicitly differentiated above.

## Suggested remediation sequence — not performed

1. Block unsafe custom Tapscript construction (F01), then add byte-level and execution-level regressions before re-enabling it.
2. Fix Inspector verification revision binding (F02).
3. Introduce strict PSBT schemas and UTXO binding; clearly separate decoded claims from verified values (F03–F04).
4. Unify descriptor/context/tree validation and correct timelock classification (F05/F10).
5. Restore the missing Dash validation, pagination, and accounting safeguards after checking current code rather than blindly cherry-picking old changes (F06–F09).
6. Fix the two Deriver UI regressions (F11).
7. Investigate the repeatable Firefox BIP85 child-wallet crash and finish the child-wallet Clear/reload acceptance flow. Repair verification harnesses and build copy-out paths (F12–F13), then resolve/document unsupported paths and documentation gaps (F14–F15).
8. Run the complete corrected suite, both direct-file browser editions, fresh pinned WASM/Docker builds, and independent Core import/spending checks for every newly advertised supported policy before a release.

This report records the assessed snapshot and reproduced defects. It is not a proof of absence of other vulnerabilities, complete BIP conformance, or safe handling of every combinatorial policy. In particular, it does not certify an unimplemented MuSig nonce lifecycle, all script-path executions, arbitrary wallet import compatibility, or an unrun fresh canonical container build.

## Original-source integrity check

At 2026-09-12T03:35:17.547027+00:00, all **399** initial source-file SHA-256 values matched. HEAD and the complete Git status were unchanged: **46 modified tracked files and 55 untracked files**, exactly as at the start. See `evidence/final-integrity.json`. These are pre-existing changes, not audit edits.

