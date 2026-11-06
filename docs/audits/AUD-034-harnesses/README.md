# AUD-034 baseline harnesses

These scripts support the whole-repository baseline of the dirty integration tree based on
`8bdd37a0dd94351b44018367bf628dfc902bc814`, captured on 2026-10-15 at
`03254f32205b0c6b4182992202dc3b2d7d5444caf8fd388e813651b1612f642d`.
They use public/synthetic fixtures and do not fix reviewed implementation files, rebuild canonical
WASM, authorize publication or certify cryptography. See [AUD-034](../AUD-034-2026-10-15.md).

Run from the repository root with Node 26.10.0, pnpm 12.8.1 and locked development dependencies.
Raw evidence stays in ignored `docs/audits/AUD-034-evidence/`. Preserve original evidence:
the recorder overwrites reused labels, so choose a **new label** for every rerun. A rerun on
later source is new evidence and does not replace the baseline conclusions.
The named commit alone does not reconstruct this dirty snapshot: the retained patch/untracked
source or a later matching integrated tree is needed. Compare file identities before interpreting
a rerun as reproduction of this baseline.

## Inventory and recording

`inventory.mjs` needs a NUL-delimited `git ls-files --cached --others --exclude-standard -z`
catalog in `AUD-034-evidence/catalog-input.bin`. It hashes existing tracked/unignored files,
partitions responsibilities and extracts declarations with pinned TypeScript. It excludes
this audit's outputs and separates historical audits from the source fingerprint. Types and
reexports are candidates, not executed operations. Do not rerun inventory over preserved
baseline evidence: it writes the snapshot and catalogues.

`run.mjs LABEL COMMAND ARGS...` records UTC times, exact arguments, exit/signal, log SHA-256
and harness hashes present at command start. Inherited file descriptors capture subprocess
output. Initial empty pipe captures and the first invalid QR fixture remain local, excluded
from product failure counts. Missing earlier execution-time hashes are not reconstructed.

```sh
TZ=UTC NODE_OPTIONS=--max-old-space-size=640 node docs/audits/AUD-034-harnesses/run.mjs rerun-public pnpm exec vitest run --config docs/audits/AUD-034-harnesses/vitest.config.mjs docs/audits/AUD-034-harnesses/public-contracts.test.mjs
```

Keep one runtime at a time, one Vitest worker and the memory reserve in the report. Neither an
empty capture nor a timed-out advisory query is a passing result.

## Public-entry probes

Select one file with the config above. Omit the filename to run all audit probes; these
intentionally fail baseline invariants and are separate from the ordinary project suite.

| File | Real code and passive boundary | Baseline result |
| --- | --- | --- |
| `qr-import-race.test.mjs` | Real importer, FileChoice, QR encoder and pixel decoder; delayed bitmap/canvas and DOM | Two stale input-edit failures and one missing listener-release observation. Nonempty to edited/empty field; no actual global Clear or GC measurement. |
| `matcher-revision.test.mjs` | Actual installer, registry/detector, BIP39 seed and client; passive Worker | One stale no-match publication failure. No actual worker derivation. |
| `inspector-contracts.test.mjs` | Real PolicyLock/ranged wallet/path card APIs and Script installer | Five contract failures, including Bitcoin Regtest to Dash. No Core RPC or spending. |
| `inspector-bip38-edit.test.mjs` | Actual installer/decryptor and one official public vector | One late password-clear failure. One KDF case, not a full campaign. |
| `public-contracts.test.mjs` | Real Core/Identity history, estimate and Blob-worker entries; passive fetch/Worker | Four failures. The 600-phrase example is arithmetic only, no scan/egress. |
| `deriver-secret-contracts.test.mjs` | Real MHFE card/lifecycle and WebCrypto adapter; passive subtle service | Four failures: blur/hidden and byte retirement on resolve/reject. No KDF. |
| `seedqr-readiness.test.mjs` | Actual installer, RecoveryJobGate, QR encoder/action/download helper; passive canvas/anchor | One PNG publication failure after readiness loss. No whole workspace or native browser. |
| `mhfe-verdict-gate.test.mjs` | Actual tab/task/run/gate; synthetic package reports | All-passed control passes; false vector verdict leaves readiness open. No actual MHFE vectors/WASM/Argon2. |
| `sskr-refusal.test.mjs` | Real checked SskrCodec and committed WASM; valid public create/recover control | One unknown-UR-type diagnostic failure. This probe instantiates SSKR WASM, without rebuilding it or running a KDF. Host visible error is a static caller trace. |
| `mnemocode-direct-contracts.test.mjs` | Exact imported scalar helper and actual public saved-card-note wrapper | Three failures: two lone surrogates and duplicate-member advice. Fixed dictionary and validated card creation remain guarded UI controls. No PDF/file generation. |
| `marked-list-completeness.test.mjs` | Actual marked-code owners, public zero-entropy completions and synthetic fingerprint service | One failure: 128 valid candidates, estimate 8, list admitted, only 100 returned without truncation state. No KDF/WASM/egress. |
| `marked-domain-oracle.test.mjs` | Independent `@scure/bip39` admission for that same public counterexample | One passing case: all 128 distinct completions valid, invalid-checksum control refused. No seed derivation or KDF. |

These observations do not establish native rendering, structured clone, CSP, browser scheduling,
clipboard permissions, filesystem disclosure or guaranteed erasure. Independent challenge and
the report determine finding disposition.

## Build, report and identity checks

```sh
TZ=UTC NODE_OPTIONS=--max-old-space-size=640 node docs/audits/AUD-034-harnesses/run.mjs rerun-canonical node docs/audits/AUD-034-harnesses/canonical-comparison.mjs
python3 docs/audits/AUD-034-harnesses/identity.py
python3 docs/audits/AUD-034-harnesses/records.py
python3 -B docs/audits/AUD-034-harnesses/validate.py
```

`canonical-comparison.mjs` invokes the read-only manifest calculator and compiles public Orchard
WASM for export metadata, without instantiation, secret calls or rebuilding sources. Baseline
exit 1 reflects the SSKR source/generated mismatch.

`identity.py` compares frozen files and instructions without changing their manifests. It detects
additions/deletions outside this audit and separately reports an audit-index publication delta.
No other source drift is allowed. Retained snapshot and procedure inputs are required.

`records.py` uses the Python standard library to check duplicate JSON keys, the exact schema
keyword subset, paired Markdown and finding-ID presence for numbered records. It does not
replay historical assertions. Exit 0 means those structural checks passed. The final validator
also checks this audit's metadata, IDs, evidence and privacy.
The standalone records script rewrites its local structural-output file; use `validate.py` for
final publication validation while preserving the original 33-record baseline output.

`assemble.py` requires retained domain/challenge/inventory/command records. It renders Markdown
and JSON, preserves allocated IDs, redacts home paths and writes no product code. Generation
is not verification: independent completeness, identity and schema checks remain necessary.

Mutation evidence is a read-only Codex32 preview with `cargo +1.99.0 mutants --list --json`:
12 candidate edits, zero compiled/applied mutants. Dirty/shared checkout conditions prohibit a
campaign. No stash/reset/commit, weakened protection or full-cost vector replay is implied.
