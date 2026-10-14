# AUD-024 source architecture harnesses

These scripts support the source and DRY review of `multi-chain-wallet-tools`, completed on 2026-10-08. They do not modify product code, copy a checkout, launch a browser, rebuild WASM, render cards or replay long cryptographic vectors.

The reviewed baseline is commit `c5b62c2d489e7525326071128095ba95ecca92ac` with pre-existing working-tree changes. Its source fingerprint is `105d2d0a422922785673f3abbc5ce2ab3879e7a8f799fe079b817dc6f93e74ac`. Git HEAD alone does not identify those changes. The local manifest binds 1,031 tracked and non-ignored untracked files by path, byte length and SHA-256, excluding `docs/audits/`. No source contents are copied into evidence.

## Inputs and prerequisites

- Run in the existing repository checkout.
- Use its documented Node.js and pnpm versions with already installed dependencies. `inventory.mjs` uses the installed Prettier Babel parser; it does not use the classic compiler API removed from the installed TypeScript 7 package.
- Python 3 is needed for command capture and source snapshots. Report validation also uses the available `jsonschema` package.
- Original audit evidence is local only in `docs/audits/AUD-024-evidence/`. It is intentionally ignored by Git. Do not overwrite its baseline manifest to make a comparison pass.

## Commands

To compare the current source with the retained original manifest:

```sh
python3 -B docs/audits/AUD-024-harnesses/source-state.py . \
  docs/audits/AUD-024-evidence/source-replay.json \
  --compare docs/audits/AUD-024-evidence/source-manifest.json
```

The expected result for the reviewed bytes is the fingerprint above and an empty `changed` list. A changed, missing or added non-ignored source file produces a nonzero exit code. A new snapshot may be captured without `--compare`; it describes the current checkout and does not reproduce a historical working tree.

The AST inventory needs `source-manifest.json`. If original local evidence is unavailable, create the ignored evidence directory and capture the current checkout into that path first. The inventory accepts either the original manifest array or the snapshot object's `files` field.

```sh
mkdir -p docs/audits/AUD-024-evidence
python3 -B docs/audits/AUD-024-harnesses/source-state.py . \
  docs/audits/AUD-024-evidence/source-manifest.json
NODE_OPTIONS=--max-old-space-size=1536 \
  node docs/audits/AUD-024-harnesses/inventory.mjs
```

`inventory.json` contains owned TS/MJS/Rust file metrics, AST function-body candidates, literal candidates and resolved first-party imports. The original review scanned 558 files and 1,851 qualifying function bodies. It found no exact or identifier-renamed body clusters and no runtime import cycles in that scoped graph. These facts do not establish the absence of duplicated semantic rules. Rust is inventoried and reviewed manually; generated and vendored code and unit tests are excluded. Independent test oracles and separate security realms must not be merged merely to reduce a count.

To capture the two bounded checks used in this review:

```sh
python3 -B docs/audits/AUD-024-harnesses/capture.py typecheck \
  env NODE_OPTIONS=--max-old-space-size=1536 pnpm check
python3 -B docs/audits/AUD-024-harnesses/capture.py architecture-tests \
  env NODE_OPTIONS=--max-old-space-size=1536 pnpm exec vitest run \
  tooling/module-boundaries.test.mjs tooling/selective-composition.test.mjs \
  --maxWorkers=1 --no-file-parallelism
```

The expected result is exit code zero; the second command ran 21 tests in two files. Capture records preserve the exact command, cwd, UTC times, exit code and combined-output SHA-256. The scripts do not relax a failing assertion. Use a fresh capture name when retaining evidence from another source state.

## Focused defect probes

Run each probe separately under the same 1,536 MiB Node heap cap:

```sh
NODE_OPTIONS=--max-old-space-size=1536 node docs/audits/AUD-024-harnesses/bip85-count-probe.mjs
NODE_OPTIONS=--max-old-space-size=1536 node docs/audits/AUD-024-harnesses/mhfe-record-probe.mjs
NODE_OPTIONS=--max-old-space-size=1536 node docs/audits/AUD-024-harnesses/child-batch-probe.mjs
NODE_OPTIONS=--max-old-space-size=1536 node docs/audits/AUD-024-harnesses/bip38-clear-probe.mjs
NODE_OPTIONS=--max-old-space-size=1536 node docs/audits/AUD-024-harnesses/csv-disable-probe.mjs
```

At the reviewed baseline all five probes report `contractPassed: false` and exit 1. This is the expected reproduction of an open product defect, not a passing acceptance test. They respectively demonstrate unsupported BIP85 word-count acceptance, a directory passed to the record generator's file reader, unchunked child batches, stale synthetic BIP38 completion after Clear/replacement, and a disabled CSV operand incorrectly described as an active delay.

The BIP85 probe first checks an independent published 12-word answer, then exercises the public API. The CSV probe exercises `decodeScript` directly with a synthetic script and the public secp256k1 generator point; its independently specified expectation comes from [BIP112](https://github.com/bitcoin/bips/blob/master/bip-0112.mediawiki#summary). It does not run a consensus interpreter.

The record and child probes execute exact AST-extracted production declarations/functions with narrow host stubs. They do not run the complete record entry point or child installer. The BIP38 probe executes the real installer against an in-memory DOM and a deferred synthetic decryptor; it does not run scrypt, a clipboard operation or a browser. Source names changing require reassessing a probe rather than silently falling back to a different helper. In-memory esbuild bundles are syntax/loading aids, not release artifacts or reproducible-build evidence.

The first child probe attempt had an incomplete fake result shape (`basicSummary` missing). That harness error is retained in `child-batch.log`; the shaped fixture's subsequent reproduction is in `child-batch-shaped.log`. Earlier inventory compatibility errors are likewise retained separately from application results. The detailed command ledger identifies every such attempt.

To validate the report and its original local evidence:

```sh
python3 -B docs/audits/AUD-024-harnesses/validate.py \
  docs/audits/AUD-024-2026-10-08.json
```

The validator checks the canonical JSON schema, all 32 coverage IDs, Markdown finding metadata, semantic counts, source-site hashes, command-log hashes and procedure hashes. Missing local evidence or changed source bytes causes failure. It validates consistency of the record; it cannot prove a semantic classification or a security guarantee. The report's definition register is a manually reviewed lower bound, not an automated exhaustive duplication count.
