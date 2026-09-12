# Documentation, integration and test-coverage follow-up — 2026-09-12

**Latest status:** confirmed findings C01–C06 are fixed; see the remediation addendum at the end. Original discovery evidence is retained below.

## Identity and scope

- Reviewer: OpenAI Codex, GPT-6 family. Exact service snapshot/model build is not exposed.
- Date: 2026-09-12; evidence timestamps UTC, operator timezone Europe/Moscow.
- Version: 0.1.4, unpublished local source.
- Repository: `hobby-eng-studious-tribble`, branch `hobby-eng-psbt-inspector-v4`, HEAD `ea5d4215ccbf355dd86f1c9928e213df1e23d186` **plus substantial local changes**. HEAD alone does not identify the reviewed implementation.
- Scope: current first-party application source, derivation/path metadata, script compilation and library integration, documentation, test/build wiring and maintainability. Dependency internals were consulted only to understand exposed integration behavior; this is not a dependency security audit.
- Method: rescan/inventory of application/package/tooling source, targeted source review, documentation comparison, public deterministic adversarial probes, selected Go/btcd differential checks, external-link availability checks and existing standalone verification commands. Not every line received a new manual proof or every possible wallet path a new execution.
- Initial review changes were limited to documentation and one browser-test metadata correction. The confirmed defects were subsequently fixed in the same existing worktree and committed in the remediation series recorded below. No push, tag or release was made.

## Assessment

The previous passing tests are real, but they do not establish complete descriptor/PSBT validation. Additional edge cases survive the first remediation. The most important are inconsistent MuSig multipath handling and unvalidated PSBT hash-preimage fields. No new High-severity loss-of-spending-control or secret-exfiltration path was demonstrated in this pass. The earlier dangerous custom Tapscript key-length defect has regression coverage; the new findings do not reproduce that bypass.

No new mismatch was found in the selected standard Bitcoin, Ethereum, Dash Core, DIP13/DIP17 or Orchard path/vector checks. This statement is bounded by the coverage matrix below. Wallet-specific paths, public-key scope, script grammar and import compatibility must remain separate claims.

Exact public reproduction inputs, observed outputs, extra-check results and link statuses are in [the evidence record](2026-09-12-03-followup-audit.json). They contain only synthetic/public test material. Existing user mnemonics/xpubs were not used.

## Findings at discovery (remediation status below)

### C01 — Medium: MuSig multipath is validated inconsistently

Locations: [descriptor.ts:131](../../apps/psbt-inspector/src/descriptor.ts#L131), [descriptor.ts:264](../../apps/psbt-inspector/src/descriptor.ts#L264), [descriptor.ts:646](../../apps/psbt-inspector/src/descriptor.ts#L646), and [musig-descriptor.ts](../../apps/psbt-inspector/src/musig-descriptor.ts).

Using public synthetic xpubs A/B:

- `tr(musig(A,B)/<0;1>/*)` is rejected as if the entire aggregate expression were an ordinary xpub. Parsing and key collection do not preserve this aggregate-key suffix as a typed expression.
- `tr(musig(A/<0;1>,B/<0;1>)/0/*)` is accepted and produces an output, although participant multipath is forbidden when deriving from the aggregate. Choosing the branch before validation erases the evidence of that restriction.

[BIP390](https://github.com/bitcoin/bips/blob/master/bip-0390.mediawiki) requires validating participant restrictions before aggregate derivation. Branch expansion also needs the [BIP389](https://github.com/bitcoin/bips/blob/master/bip-0389.mediawiki) key-expression rules. Fix the original grammar before substituting branches; do not merely repair the displayed error. Test both branches, multiple indices and forbidden participant/aggregate combinations.

The installed Go descriptor parser does not support these MuSig descriptor expressions. Its rejection is **not** an independent invalidity oracle. Use BIP literals and an implementation supporting the expression for differential output checks.

### C02 — Medium: a MuSig key inside a Taproot tree bypasses origin validation

Locations: [descriptor.ts:264](../../apps/psbt-inspector/src/descriptor.ts#L264), [descriptor.ts:397](../../apps/psbt-inspector/src/descriptor.ts#L397), [musig-descriptor.ts](../../apps/psbt-inspector/src/musig-descriptor.ts).

`tr(G,{pk(musig([bad]G,H)),pk(H)})` is accepted and compiled. G/H are the compressed public points for public test scalars 1/2. The nested MuSig parser strips the malformed origin, while ordinary descriptor-key validation rejects it. Tree branches represented as strings bypass the common recursive key validator.

Origin metadata does not itself change these fixed public points, so this is not a demonstrated spending bypass. It is a real inconsistency with the advertised validation boundary and a warning that grammar validation is fragmented. Add nested valid/invalid origins, oversized path steps, malformed tuples and mixed-network xpubs for internal keys and every leaf position.

### C03 — Medium: known PSBT hash-preimage fields are not validated

Location: [psbt.ts:281](../../apps/psbt-inspector/src/psbt.ts#L281), `validateMap`, and the field-name table.

A synthetic PSBTv2 accepts input type `0x0a` with a one-byte hash key. It also accepts a 20-byte all-zero key paired with `public preimage`, whose RIPEMD160 digest is different. Both exact Base64 reproductions are in the evidence record. The other BIP174 preimage types `0x0b`–`0x0d` lack corresponding checks too.

[BIP174](https://github.com/bitcoin/bips/blob/master/bip-0174.mediawiki) defines exact hash widths and requires each supplied preimage to hash to its key. Checking these commitments is separate from validating a transaction signature. Add valid/malformed/mismatched fixtures for all four algorithms and classify these fields by name. The existing 133 official PSBT corpus cases did not expose this omission.

Do not expand the documentation claim to “all known fields validated”: DER signature encoding, global extended-key metadata/version consistency and script/control-block relationships also deserve an explicit implemented/unimplemented matrix. These additional relationships were not all independently reproduced here and are coverage priorities, not additional confirmed vulnerabilities.

### C04 — Low: valid legacy uncompressed P2SH-P2PKH compilation fails

Locations: [miniscript-engine.ts:105](../../apps/psbt-inspector/src/miniscript-engine.ts#L105) and [descriptor.ts:436](../../apps/psbt-inspector/src/descriptor.ts#L436).

`sh(pkh(U))`, where U is the valid 65-byte uncompressed public point for scalar 1, passes key validation but fails ASM serialization at `<HASH160(U)>`. The serializer supports 32/33-byte hash arguments only. The Go descriptor oracle accepted this example and returned `3LRW7jeCvQCRdPF8S3yUCfRAx4eqXFmdcr`. **Correction during remediation:** this is the compressed-key address; that oracle normalized the supplied 65-byte key. Independent Python/OpenSSL hashing and explicit script serialization establish `3DJgFhQBWVq9CdfzyJ9m5Lo6cYKh24anLh` for the actual uncompressed key. The regression now asserts both encodings separately.

[BIP381](https://github.com/bitcoin/bips/blob/master/bip-0381.mediawiki) legacy key support must not be confused with SegWit's compressed-key requirement. Add this positive legacy case and retain negative uncompressed SegWit/Tapscript tests; do not broaden all contexts indiscriminately.

### C05 — Low: recognized-only descriptor forms accept malformed arguments

Location: [descriptor.ts:588](../../apps/psbt-inspector/src/descriptor.ts#L588).

`sp()` and `combo(00)` return a decoded summary instead of rejecting missing/invalid keys. They do not produce a compiled output, limiting the impact. The UI's phrase “structurally decoded” is stronger than the checks actually performed. Validate arity/key shapes for supported recognition, or clearly return an unsupported/unvalidated result. Do not treat recognition as a successful wallet-import check.

### C06 — Low: Docker wrapper exits can skip cleanup

Location: [build-reproducible.mjs:19](../../tooling/build-reproducible.mjs#L19), `run()` and outer `finally`.

Static control-flow finding: `run()` calls `process.exit()` when a Docker subprocess fails. If `docker cp` fails after container creation, this terminates Node without executing the outer cleanup `finally`; the created container and temporary directory can remain. The corrected per-edition manifest paths do not address this failure path. Propagate a failure through cleanup and set the exit status afterward. Add a fake-Docker subprocess test asserting container removal and preservation of prior `dist`; no actual Docker build is needed for that regression. This scenario was not executed against a real Docker daemon in this pass.

## Documentation corrections and remaining UI text

Corrected current documentation:

- Inspector BIP38 secret handling is now explicit in architecture/security notes; Deriver is no longer called the only offline application.
- Inspector's optional phrase/preimage calculator no longer conflicts with a blanket “never asks for preimages” statement.
- Startup cryptographic self-tests are no longer claimed for Inspector. Its badge says parser checks are enabled; it does not execute an equivalent startup vector group.
- Root features and draft release notes now include BIP38, message signing, BIP85/BIP352 and the fourth utility. The source tree is explicitly marked unreleased.
- Dash Community release-file documentation now includes its Inspector HTML/sidecar; third-party branding copy says four headers.
- Scure BTC Signer attribution includes its actual private-key BIP322 message-signing use in Deriver.
- Platform seed discovery documents both hardened classes; Purpose48 `0'` is labelled wallet-specific rather than a universally standardized BIP48 legacy type.
- Release instructions now distinguish separate browser/live checks from deterministic CI. Historical audit dates/versions were retained as history, not relabelled as fresh evidence.
- Direct JavaScript dependency versions in notices match the current manifest. The earlier license/provenance review date was not silently renewed.

Remaining application copy issues, not changed in this documentation-only pass:

- `tooling/build-profiles.mjs:10/20` and Deriver's mnemonic placeholder say only 12/24 words, while `crypto-core/src/bip39.ts` accepts 12/15/18/21/24. Random generation still offers 12/24; input acceptance is broader.
- `apps/psbt-inspector/src/app.ts:641` labels compiled descriptor output “Compiled Bitcoin data” even when Dash is selected.
- `crypto-core/src/bip39.ts:20` says errors avoid echoing words, but its unknown-word branch includes the word in a local error. Candidate-scan export deliberately replaces that error with fixed text; no export/network leak from that route was demonstrated. Align the comment and the intended error-disclosure policy.

External-link GET checks returned HTTP 200 for all **49 unique URLs** extracted before the new report links were added. This verifies reachability, not every remote fragment anchor, authenticated UI or semantic claim. Existing relative-file links are checked by `verify-project-facts`; that checker does not validate Markdown heading anchors. The new normative BIP links were separately opened/read. Old release/audit version references are intentionally historical, not broken version pins.

## Derivation and integration coverage matrix

| Area | Evidence present | Important next coverage |
| --- | --- | --- |
| BIP39/BIP32 | Leading-zero official vectors, seed/passphrase normalization, independent HD derivation and index bounds | Imported extended-key version/origin combinations across every Inspector expression; 15/18/21-word input through UI/export |
| Bitcoin BIP44/49/84/86 | Fixed outputs, account/branch separation, public/private descriptor children, both Taproot internal-key parities | Real Bitcoin Core import/derive-address checks for all exported profiles; keep randomized/property cases bounded |
| Ethereum | Standard BIP44, Ledger Live and legacy Ledger paths in scanner; exact EIP55/HD comparisons | Ensure overlap/account offset and custom-range tests assert final public addresses independently, not only path strings; legacy Ledger uses its fixed `0'` account root |
| Dash Core/mobile/DIP9 | Mainnet/testnet startup vectors, selected account/branch exports and watch-only boundaries | Preserve old pagination regressions; Core desktop CoinJoin is not automatically a DIP9 wallet |
| Dash Purpose48 | Independent account 0/17, branch 0/1, index 0/49/max child keys | Actual target-wallet import/sign compatibility; `0'` legacy convention is not specified by BIP48's SegWit type table |
| Dash DIP13 | Four-role profile, all-hardened paths, mainnet/testnet dashhd comparison | Role metadata variants and nonzero Identity indices; do not invent a wallet account level |
| Dash DIP17/DIP18 | Receive/internal hardened classes, official address examples, storage/display distinction and mixed-case rejection | Explicit Platform P2SH display vectors at Viewer boundary; scanner/Deriver intentionally derive P2PKH only |
| Orchard ZIP32 | Fixed official wallet note/component fixtures, native/WASM checks, both scopes, nullifier/spend reconstruction | Preserve ledger replacement/reconciliation and cancellation tests; do not infer timestamps from pool positions |
| BIP85 | Official mnemonic/WIF/XPRV/hex examples plus independent HMAC and parent/child passphrases | Isolate the intermittent Firefox reload failure; test request revision changes while child signing is active |
| BIP352 | Path/label boundaries and independent address/hash arithmetic | Add applicable literal official address/label vectors; full sender/receiver transaction vectors are outside this address-only feature |
| Descriptors/Miniscript/Taproot | Core literal script vectors, selected BIP341 trees, BIP327/328 and BIP390 outputs | C01–C05; cross-product of tree positions, wrappers, origins, sorting, network, branch and index |
| PSBT | 133 BIP174/370/371/373 corpus cases, adversarial UTXO binding and shape tests | C03, full recognized-field schema matrix and malformed control-block/script commitments with honest unsupported states |
| MuSig signing/nonces | Structural participant/nonce/scalar checks; aggregation vectors | No first-party signer/coordinator exists. Do not pretend its nonce lifecycle was tested or add signing solely to satisfy a coverage table |

[BIP48](https://github.com/bitcoin/bips/blob/master/bip-0048.mediawiki) explicitly covers SegWit script types `1'`/`2'`; it does not establish this tool's Dash `0'` legacy convention. [DIP17](https://github.com/dashpay/dips/blob/master/dip-0017.md) and [DIP18](https://github.com/dashpay/dips/blob/master/dip-0018.md) remain Proposed in the checked sources. No derivation path was changed to match a different wallet convention during this review.

## Earlier tests and command wiring

The current Vitest configuration includes **70 `.test.ts` files plus six tooling `.test.mjs` files**. It does not ignore the existing `independent-conformance-audit` or Inspector conformance suite. The separate verification scripts are documented in [VERIFICATION.md](../VERIFICATION.md).

Compared relative verification filenames with available `super-broccoli`, `supreme-broccoli`, the renamed Documents checkout and `.copilot/repos/multi-chain-wallet-tools`. Three test filenames exist in `super-broccoli` but not here:

1. `packages/dash-network/tests/address-pagination.test.ts`: direct malformed-total/page/hash and across-page duplicate cases. Some behavior is covered in current history tests; preserve the full case matrix, including duplicates beyond the displayed prefix and opposite-case hash duplicates.
2. `packages/dash-network/tests/platform-explorer-network.test.ts`: positive and negative mainnet/testnet ID matrix. Current `provider-json.test.ts` has a narrower explicit wrong-mainnet set; integration tests are not a replacement for every direct matrix case.
3. `tooling/build-reproducible.test.mjs`: fake-Docker edition copy-out and prior-output preservation. Current path correction lacks that direct regression.

These are gaps to adapt to current APIs, **not a reason to copy old production modules**. No additional verification filenames were found in the other three compared locations. Filename comparison does not prove that every same-named file has identical assertions or establish which AI wrote it. External `/tmp` scripts from past sessions may not be preserved by any repository.

The vector updater pins upstream revisions, but its regex extraction lacks explicit minimum/count assertions. Add count/provenance checks when refreshing it. Otherwise an upstream syntax/parser mismatch could silently reduce coverage. The 11 public BIP390 positive outputs do not cover the invalid/multipath matrix discovered here.

## Maintainability recommendations

1. **Consolidate descriptor grammar first.** `descriptor.ts` (801 lines) and `musig-descriptor.ts` use separate delimiters, expression handling and key traversal. This duplication is connected to C01/C02, not merely a style preference. Keep a typed parsed tree with origin/suffix/range information; validate it once before branch selection, then compile and render from it.
2. **Use one BIP380 checksum implementation.** Inspector duplicates the constants/polymod in `export-core/src/descriptor.ts`. Share it and retain literal expected checksums so both producer and consumer cannot agree on the same new bug unnoticed.
3. **Split UI state by workflow.** Deriver controller is 2,053 lines; Inspector app is 1,403. BIP85 child wallet, BIP38 and message workflows have distinct revisions, workers and secret cleanup. Extract those ownership boundaries with explicit dispose/invalidate contracts, rather than splitting files arbitrarily by line count.
4. **Move shared history out of an application.** Activity Viewer imports Scanner network/history modules. An existing roadmap item already proposes a shared package. Preserve the no-secret Network Worker graph and Dash edition allowlists during extraction.
5. **Separate schema validation from presentation.** PSBT per-field validation and field labels should come from a small explicit schema map, with supported/opaque/unchecked statuses. Avoid a second independent field list drifting from validation.
6. **Keep security boundaries separate.** Do not merge vault/network code, Bitcoin-only modules and Dash disabled stubs merely to remove files. Compile-time edition exclusion and disposable secret workers are useful boundaries.
7. **Do not over-refactor tiny adapters.** Repeated path literals across metadata and derivation deserve a consistency test, but a generic “derive any script” abstraction could erase hardened/context distinctions. Improve shared contracts incrementally after regression coverage exists.

## Checks executed in this follow-up

- New deterministic descriptor probes: six inputs; observed results retained, including expected failures and permissive acceptances. They are findings, not six passing correctness tests.
- Two synthetic malformed PSBT preimage-field probes: both incorrectly accepted.
- Go descriptor comparison: legacy uncompressed P2SH-P2PKH accepted; MuSig descriptor parser unsupported, so not counted as a differential conformance failure.
- Existing DIP13 differential, shared Orchard stream, both startup suites and generated-WASM verification: **all five commands passed**.
- External link reachability and direct dependency-version reconciliation completed.
- Final documentation/metadata/type/whitespace checks are recorded in the evidence file.
- The prior 919-test and browser results were not rerun wholesale: no functional application code changed in this pass. The Firefox BIP85 intermittent reload crash remains open as recorded in the earlier remediation report.

No fresh Docker/WASM rebuild, dependency source audit, actual wallet import, funded spend or release acceptance is implied. Newly found functional defects should receive their own regression cases and minimal fixes before any broad parser refactor.

## Canonical metadata review

The root `package.json` supplies the release version and date through `readReleaseMetadata`. `metadata:sync` propagates the version to workspace manifests, the first-party Rust crate and lock entry, its notice and the current release-note markers. HTML build metadata reads the same source; edition/artifact paths come from `BUILD_PROFILES`. `metadata:check` verifies synchronization and selected code-derived facts, including network-operation counts, batch sizes and documented artifact paths.

The Inspector browser acceptance assertion still contained literal `0.1.4`; this follow-up changed it to `release.version`. No browser rerun is implied by this small test-only correction. Release-note files must still be created and their substantive content curated when changing versions. Historical releases, audit dates and third-party dependency versions must not be overwritten with the current product version. Product fact assertions check selected text, not the correctness of every documentation statement or every runtime registry.

## Remediation addendum — 2026-09-12

Reviewer/implementer: OpenAI Codex, GPT-6 family; exact service snapshot unavailable. Applied to the same `hobby-eng-studious-tribble` working tree, retaining pre-existing local changes. This addendum supersedes the open status above, not the original observations.

| Finding | Correction and regression evidence | Status |
| --- | --- | --- |
| C01 | Preserve aggregate suffix parsing; validate original participant paths before selection; reuse the public BIP32 suffix validator for synthetic aggregate xpubs. Both branches, indices 0/7/2147483647, mixed participant/aggregate ranges and malformed suffixes are tested. Go KeyAgg + Go HD derivation + concrete Go Taproot output provide independent comparisons. | Fixed |
| C02 | Every MuSig participant passes shared origin/key/network validation, including nested leaves and the direct analysis entry point. Valid origins preserve outputs; malformed/oversized origins and opposite-network keys reject. | Fixed |
| C03 | All four BIP174 input preimage fields validate hash width and actual commitment; field names are explicit. Node/OpenSSL provides independent hashes for empty and nonempty valid values, wrong widths and wrong commitments. | Fixed |
| C04 | ASM serialization accepts 65-byte HASH160 arguments only after contextual public-key validation. Legacy uncompressed/compressed results remain different; SegWit/Tapscript rejection tests remain. The Go normalization limitation is corrected above. | Fixed |
| C05 | Silent Payments recognition requires two key expressions; combo requires one valid key. Missing, invalid and nested non-key arguments reject; valid recognized forms remain accepted without claiming compilation/import support. | Fixed |
| C06 | Subprocess failures throw through cleanup; the outer handler sets the exit code. Fake-Docker tests assert container removal, empty temporary directory and unchanged previous output on copy failure or missing edition; build failure is covered too. | Fixed |

Restored the three earlier regression files against the current APIs, not old production code. Vector refresh now asserts the pinned BIP32 path counts, Core Miniscript count and each PSBT corpus's positive/negative counts before overwriting fixtures. The updater itself was syntax-checked; no remote refresh was needed. Input copy now lists all five accepted BIP39 lengths; generated phrases still offer 12/24. Inspector uses a chain-neutral compiled-data heading. The BIP39 error comment now accurately describes local diagnostics and candidate-export sanitization.

Verification: full Vitest **973/973 in 80 files**, TypeScript, metadata synchronization, project facts, JavaScript syntax and whitespace checks passed. Source regressions are [audit-followup.test.ts](../../apps/psbt-inspector/tests/audit-followup.test.ts), the existing [independent conformance suite](../../apps/psbt-inspector/tests/independent-audit/crypto-conformance.test.ts), and [Docker cleanup tests](../../tooling/build-reproducible.test.mjs), plus the restored Dash pagination/network files. Final artifact/browser evidence is appended after completion.

Scope remains bounded: arbitrary-length multipath tuples, full PSBT signature/semantic validation, actual wallet import/sign/spend and broad architectural refactors are not added. Earlier intermittent Firefox BIP85 reload failure is tracked separately; a fresh passing run alone cannot establish its root cause. The corrections were committed locally; no push, tag or release is implied.

### Final artifact/browser results

All eight HTML artifacts were rebuilt locally without Docker. Artifact source fingerprints, checksums, CSP/security markers and edition exclusion checks passed. **16/16** basic direct-file acceptance cases and **34/34** extended Chromium/Firefox regression cases passed, including the new descriptor replacement scenarios. The extended run also passed Firefox BIP85; this does not establish the cause of the earlier intermittent reload crash.

Structured checks, source fingerprint, artifact hashes and individual browser outcomes are retained in [the evidence record](2026-09-12-03-followup-audit.json), under `remediation`. Full local browser reports/screenshots are in `test-results/browser-files/2026-09-12T04-24-07.364Z/` and `test-results/browser-regressions/2026-09-12T04-26-24.921Z/`. No Docker build, native Rust run, WASM regeneration, funded transaction or publication was performed in this correction pass.
