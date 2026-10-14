# AUD-026 audit harnesses

These files belong to audit AUD-026 of multi-chain-wallet-tools; see the [report](../AUD-026-2026-10-09.md) and its [JSON companion](../AUD-026-2026-10-09.json). The reviewed source is HEAD `c5b62c2d489e7525326071128095ba95ecca92ac` plus an uncommitted working tree, identified by its source manifest (fingerprint `74aa133017165ed51feb685514e5059ed4827d5a36c7731728c374fb741e25c3`, 1253 paths). During the audit, outside it, 66 paths of audit-record text and commit references changed (second fingerprint `6f59efb4fa1e4d4e5e1f3a60dc0d2f5f1fd9d7a11f540effb6cedac9c2682557`); the report explains why the results apply to both. HEAD alone is not the tested source.

Run every command from the repository root with Node 26.10.0, pnpm 12.8.1 and the installed, pinned dependencies; the `.py` files need Python 3 (standard library, plus `jsonschema` for the record checks); run them with `python3 -B` so that no bytecode cache is written next to them. Inputs are public test data only: `abandon … about`, `TREZOR`, the BIP85 master key, published BIP39/BIP32/BIP380/BIP65/BIP112 vectors, the browser suite's public counter entropy 76562, the MnemoCode repository's published vectors (sibling `mnemocode` checkout) and synthetic provider answers. Nothing here needs the network, a real wallet, full-size Argon2, a Docker build or GitHub Actions. Browser and build scripts are heavy: run them one at a time (the audit wrapped them in `flock docs/audits/AUD-026-evidence/heavy.lock`). Evidence stays local in the ignored `docs/audits/AUD-026-evidence/`.

Exit codes: Vitest exits non-zero when an assertion fails; the other scripts exit 0 when every check holds and 1 when a product check fails (some probes assert a defect and exit 1 while it exists, as noted). "Expected" below describes the reviewed tree.

## Later authorized remediation

The original review and its defect probes remain historical. The dated remediation phase in the report records all 32 corrections against a later uncommitted source manifest at HEAD `c5b62c2d489e7525326071128095ba95ecca92ac`. A fixed row retains explicit runtime/release verification gaps; no release or browser acceptance is inferred from bounded source checks. Current HTML supersedes the earlier AUD-027 artifacts, whose evidence is retained.

- `capture-remediation.py <fresh-name> <command> [args...]` uses the shared AUD-027 recorder with the AUD-026 evidence directory, a 90-second command bound and source manifests before/after each command. It refuses reused names and preserves failures. Set `NODE_OPTIONS=--max-old-space-size=1536`; use one Vitest worker or one build at a time. The recorder bounds command time and Node heap, not total host memory; inspect other active sessions and available memory separately.
- `build-remediation.py <default|watch|artifacts> <fresh-prefix>` builds the eight default pages, four selected watch-only samples, or runs the eight artifact verifiers sequentially. It never starts browsers, Docker, WASM regeneration or a release bundle. Run the global Dash gate separately. Expected on the corrected source: exit 0 and local ignored HTML/logs.
- `format-remediation.py <fresh-record-name> <write|check>` derives changed source paths from the remediation baseline and applies the repository formatter only to supported extensions. Audit Markdown is excluded so its historical prefix remains unchanged.
- `provenance-remediation.mjs` invokes the real dependency verifier with explicit offline upstream lookup refusal; package-manager integrity and current local source hashes are checked. Expected: exit 0 with warnings that remote availability was not queried and that the two upstream copies remain unreleased. This is not upstream existence or release provenance evidence.
- `manifest-refusal.mjs` verifies that a real host manifest write refuses and leaves bytes unchanged, and that source drift still refuses. Expected: exit 0 with both refusals recorded. It never regenerates or rewrites canonical WASM.
- `append-remediation.py` consumes the retained original report/Markdown, remediation baseline, fresh command records, current source and twelve local HTML outputs. It appends one dated phase, assigns one disposition to every original finding, formats only the new Markdown fragment, and refuses a second append. Required successful command names are in the script. Run it only after those commands complete; it starts no tests or builds. The original report files must match their retained baseline copies byte for byte before this operation.
- `validate-remediation.py` checks the schema, all unchanged historical fields and Markdown prefix, every command/log/manifest hash, all 32 dispositions and their source owners, the exact current source manifest, and twelve current ignored assets built from that source. It also checks that the report carries no machine-specific paths and that evidence is untracked. Expected: `{"remediation":"passed", …}`, exit 0. Validation results stay in local evidence.
- `validate-report.py docs/audits/AUD-026-2026-10-09.json` continues checking the original finding register and retained historical evidence; after an append, it writes `remediation-baseline-validation.json`. The shared procedure-change helper accounts for the later edit of the audit guide without changing the old procedure hashes.

The new `mhfe-new-wallet-revision` case in `tooling/verify-browser-regressions.mjs` is registered beside `mhfe-chosen-word` for both editions and engines. It delays a public counter draw, edits a text field or word-mode answer, observes past the return time, and refuses encryption before Argon2 if stale publication escapes. It was syntax-checked only: the owner requested no browser execution. Full vector replay, full-size KDFs, mass cards/PDFs, canonical WASM comparison and native launcher builds remain outside this phase.

A concurrent upstream reference update changed only the quoted MHFE commit prefix in AUD-026-DOC001 before the append. The recorder admits that exact field substitution after checking every other original field and Markdown byte; it retains separate rebound baseline files without overwriting the earliest originals. The phase and validator bind both states and explicitly record the change. This does not imply that historical checks were rerun.

## Shared tools

- `record-command.mjs <unique-name> -- <command> [args...]` runs one command and keeps a local `.log` and `.command.json` in `docs/audits/AUD-026-evidence/`: exact argv, UTC interval, exit code, log SHA-256 and the build source fingerprint before and after. It stops the command's process group when the host's available memory falls below 700 MiB, and refuses an existing name. Copied from AUD-023.
- `capture-snapshot.py [--name <unique-name>]` hashes every tracked and untracked non-ignored path in place (AUD-026 files excluded) into `snapshot[-name].json` with one fingerprint; no checkout is copied.
- `validate-report.py docs/audits/AUD-026-2026-10-09.json` validates the report against `docs/audit-report.schema.json` without duplicate keys, the paired Markdown (finding headings and register, snapshot fingerprints, 32 check IDs, links), every command record's log hash, the procedure, finding-source and artifact hashes, and that no evidence file is staged. It writes `report-validation.json` locally. Expected: `{"valid": true, …}`, exit 0, while the reviewed files and `dist/` are unchanged.

## Security reviewer

- `security-dist-inventory.mjs` reads the eight built pages in `dist/`: one CSP per page, the vault CSP inside the Scanner shell, `sandbox="allow-scripts"`, external tags and lexical counts of DOM sinks, storage, network and console uses. Command: `node docs/audits/AUD-026-harnesses/security-dist-inventory.mjs`. Expected: exit 0.
- `security-boundaries-runtime.mjs <engine>` opens the Deriver, Inspector and Scanner vault of both editions in one engine (file://, normal security, DNS mapped away) and tries fetch, WebSocket, images, frames, workers, forms, popups and navigation. Expected (Chromium): exit 1 only for top-level navigation and popups from the Deriver and Inspector (AUD-026-DOC004); everything else blocked.
- `security-guards.audit.test.ts` (with `security-vitest.config.mjs`): the public-input guard and the Scanner's export tripwire with raw, case, separator, hex, Base64 and percent variants. Command: `pnpm exec vitest run --config docs/audits/AUD-026-harnesses/security-vitest.config.mjs docs/audits/AUD-026-harnesses/security-guards.audit.test.ts`. Expected: 30 pass, 3 claim tests fail (AUD-026-SEC002).
- `security-randomness.audit.test.ts` (same config): default random sources, the fail-closed chosen-word search and wiping. Expected: pass.
- `security-mhfe-new-stale-wishes.mjs` drives MHFE's New wallet tab in the built Deriver (Chromium) with the public counter source and a pause in the draw, and withdraws the chosen word during the draw. Command: `node docs/audits/AUD-026-harnesses/security-mhfe-new-stale-wishes.mjs`. Expected: exit 1 while AUD-026-SEC001 exists (the withdrawn word is shown).
- `security-deriver-gate-function.mjs` applies the Deriver artifact gate's forbidden list to Function constructor forms and counts them in both built Derivers. Expected: exit 1 while AUD-026-BLD006 exists.

## Functional reviewer

Vitest harnesses use `functional-vitest.config.mts`: `pnpm exec vitest run --config docs/audits/AUD-026-harnesses/functional-vitest.config.mts <file>`. A dump test writes `docs/audits/AUD-026-evidence/functional/*.json`, which the matching Python oracle reads.

- `functional_ref.py`: an independent pure-Python reference (secp256k1, BIP39, BIP32, Base58Check, Bech32/Bech32m, BIP86, Keccak-256, EIP-55, BIP380 checksum) that checks published vectors on import; it reads the English word list from `node_modules/@scure/bip39/wordlists/english.js` and accepts it only by its published SHA-256.
- `functional-chosen-words-oracle.py`: replays the six startup known answers of the chosen-word generator. Expected: six MATCH lines.
- `functional-derivation-dump.test.ts`, then `python3 -B docs/audits/AUD-026-harnesses/functional-derivation-oracle.py [--negative]`: production derivations of 12 adapters and 7,630 comparisons (negative mode: all 480 mutations detected).
- `functional-bip39-dump.test.ts`, then `functional-bip39-oracle.py`: BIP39 and SeedQR at every length plus refusals (179 comparisons).
- `functional-chosen-words-dump.test.ts`, then `functional-chosen-words-properties.py`: 7,500 generated phrases, their properties and chi-square of the anywhere position.
- `functional-bip85-dump.test.ts`, then `functional-bip85-oracle.py`: BIP85 applications and the BIP's published values (97 comparisons).
- `functional-multisig-dump.test.ts` (needs the derivation dump), then `functional-multisig-oracle.py [--negative]`: ranged multisig wallets (58 comparisons; negative 12/12).
- `functional-discovery-addresses.test.ts`, then `functional-discovery-addresses-oracle.py`: the 116 addresses the seed scans ask about.
- `functional-discovery.test.ts`: gap, deduplication and refusal probes; its DEFECT tests assert the observed behaviour of AUD-026-FUN002 and FUN003 and pass while those exist.
- `functional-script.test.ts`: script-number, asm and inferred-policy probes; its DEFECT tests assert AUD-026-FUN001 and FUN004.
- `functional-mnemocode-vectors.test.ts`: the MnemoCode repository's seven published vectors through the Deriver glue (needs the sibling `mnemocode` checkout).
- `functional-self-test-mutants.mjs <scratch-dir>`: seven in-memory mutants of production code against the startup self-test (esbuild, nothing written to the tree). Expected: all as expected, the change-branch mutant surviving.

## Integration reviewer

- `integration-scanner-clear-restart.audit.test.ts` and `integration-checked-worker-retry.audit.test.ts`, with `integration-vitest.config.mjs`: `pnpm exec vitest run --config docs/audits/AUD-026-harnesses/integration-vitest.config.mjs <file>`. The first exits 1 while the Scanner controller lets an old run touch a new one (latent observation); the second exits 1 while AUD-026-API002 exists.
- `integration-ui-probes.mjs <mode> <engine>` on the built pages: `layout` (widths 1280, 800 and 390, both editions; exits 1 while AUD-026-UI001 exists, writing screenshots and a report to `docs/audits/AUD-026-evidence/integration/`), `draw` (AUD-026-API001), `workers` (workers started while typing). One engine per invocation, about a minute each.

## Build reviewer

Build harnesses write only into the scratch folder given as an argument.

- `build-selective-sample.mjs <scratch> [smoke|extra]` compiles every smoke-plan job one by one plus 16 extra compositions and scans each page for left-out markers. Expected: exit 1, six watch-only Discovery builds fail (AUD-026-BLD001).
- `build-import-chain.mjs`: `TRACE_TARGET=/crypto-core/src/bip39.ts node docs/audits/AUD-026-harnesses/build-import-chain.mjs <builder> <args>` prints the esbuild import chain to the matching inputs for an unmodified builder script. Expected: the chain of AUD-026-BLD001.
- `build-selective-startup.mjs <scratch>` (after the sample): the startup self-test of nine selective pages in Chromium. Expected: 9/9 pass.
- `build-option-probes.mjs`: 25 edge cases of the selective-build option parsers. Expected: 25/25 as documented.
- `build-dash-extended-scan.mjs [pages]`: a wider non-Dash term scan of the Dash Community pages. Expected: exit 1 for the Silent Payments text (AUD-026-BLD004) plus listed false positives.
- `build-provenance-offline.mjs`: the provenance gate with every GitHub request refused. Expected: exit 0, ten refused queries listed.
- `build-project-facts-all.mjs <scratch>`: the project-facts gate with broken links collected so that later checks run. Expected: exit 1, 14 broken links in the AUD-024 report only (AUD-026-DOC003).
- `build-audit-records.py`: schema, numbering, index and finding IDs of all audit records. Expected: one legitimate follow-up ID reported.
- `build-historical-records-diff.py`: the edited historical records against HEAD after normalizing home-directory paths. Expected: only normalized paths and record notes differ.
- `build-snapshot-drift.py`: the live tree against `snapshot-baseline.json`. Expected: exit 0 on an unchanged tree (exit 1 after the 23:41 UTC metadata change, by design).

## Architecture reviewer

Each runs with `node docs/audits/AUD-026-harnesses/<file> [output.json]`, needs the installed dependencies only and writes nothing but the optional output.

- `architecture-import-graph.mjs`: the resolved first-party import graph. Exits 1 on an unresolved import, an app-to-app, package-to-app or production-to-test edge, or a runtime cycle. Expected: exit 0 (577 files, 2,135 edges).
- `architecture-contract-probes.mjs`: seven single-owner probes (chosen-word validity, MHFE provenance coverage, word-count copies, download helper, English lists, Dash address facts, wasm-bindgen pin). Exits 1 when one fails. Expected: exit 1 (AUD-026-UI003, BLD007, ARC002, ARC004, ARC006 and open AUD-024 families).
- `architecture-repeated-lists.mjs`: an inventory of repeated literal lists. Exits 1 when the Inspector's fragment classes have more definitions than distinct sets. Expected: exit 1 (AUD-026-ARC003).
- `architecture-chosen-search-probe.mjs`: exits 1 when an aborted chosen-word search still resolves. Expected: exit 1 (AUD-026-ARC001).
- `architecture-alias-maps.mjs`: exits 1 when the tsconfig and Vitest alias sets differ. Expected: exit 1 (AUD-026-ARC007).
