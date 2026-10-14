# AUD-022 audit harnesses

These files belong to the review of commit `c5b62c2d489e7525326071128095ba95ecca92ac` plus the dirty working tree identified in the [report](../AUD-022-2026-10-06.md). HEAD alone is not the tested source. The resumed/final 987-path manifest fingerprint is `007212c257185cf5eda39dbc7adae1d85010645248cfe27e3955f2cd08aaf663`; the final HTML build fingerprint is `d5482299f712f09866bff0f46e49dab6292b3c8098de863627c01206a5e8b28f`, using the repository's different source-set algorithm.

Run from the existing repository root with Node 26.10.0 and pnpm 12.8.1. Use installed pinned dependencies. Inputs are public BIP39/SLIP39 fixtures, zero entropy, synthetic PSBTs and deferred synthetic client responses. Nothing here needs real wallet material, full Argon2, a Docker rebuild or generated cards/PDFs. Do not run all release commands merely to rerun these probes.

- `record-command.mjs` saves a local `.log` and `.command.json` with exact argv, UTC interval, exit code, log SHA-256 and source fingerprints. It uses one Node heap budget of 1536 MiB and stops its process group if sampled host usage exceeds 14 GiB. It does not limit unrelated processes or guarantee the host between samples. Run checks sequentially. Names must be unique so evidence is not overwritten.
- `capture-snapshot.py --name <unique-name>` hashes tracked and untracked non-ignored source in place. It excludes AUD-022-owned files and refuses to overwrite snapshots. It creates a manifest, diff and procedure hashes locally; no checkout is copied.
- `scanner-import.audit.test.ts` challenges Clear during actual age decryption. Its current-source control passes. `scanner-panel.audit.test.ts` loads the actual panel/importer and defers only the File read; unchanged import passes and Clear-before-read-completion fails on the reviewed bytes.
- `mnemocode-contracts.audit.test.ts` challenges empty optional lists and late stored-passphrase validation using real search adapters with bounded wallet callbacks. See [MnemoCode details](mnemocode-README.md).
- `crypto-protocols.audit.test.ts` exercises one published SLIP39 quorum, synthetic actual PSBT parser/signing analysis and an explicitly instrumented MNCL cleanup observation. See [cryptography details](crypto-README.md). Instrumented leftover memory is not an uninstrumented disclosure finding.
- `mhfe-contract-probes.mjs` loads unchanged production engine/field classes with synthetic preparation/client/DOM collaborators. It challenges Cancel before client preparation and password-review responses after edits. See [MHFE limits](mhfe-contract-probes.md).
- The four `deriver-*.mjs` probes exercise real BIP85, MHFE Check, written-backup Check and Rekey owner lifecycle. See [Deriver controls and limitations](deriver-README.md). `deriver-vm-support.mjs` verifies loaded modules against local `snapshot-resumed.json`. To rerun with absent evidence, first capture that named snapshot and require the report's exact fingerprint; do not relabel changed source as the original audit.
- `browser-layout.mjs <unique-label>` reads six actual edition/tool metadata passports and captures eight selected Deriver layouts at desktop/mobile sizes. It starts isolated pinned Chromium contexts, generates no recovery output and writes only ignored local evidence. It requires fresh default HTML from `pnpm build`. It checks horizontal page width, not full visual/accessibility acceptance.
- `validate-report.py <json-path>` validates schema, duplicate keys, finding/coverage IDs, paired Markdown metadata/links, command log hashes and source identity. It is an audit-record check, not a product test.

Example bounded commands:

```sh
node docs/audits/AUD-022-harnesses/record-command.mjs my-search-probes -- pnpm exec vitest run --config docs/audits/AUD-022-harnesses/vitest.config.mjs docs/audits/AUD-022-harnesses/mnemocode-contracts.audit.test.ts --reporter=verbose
node docs/audits/AUD-022-harnesses/record-command.mjs my-protocol-probes -- pnpm exec vitest run --config docs/audits/AUD-022-harnesses/vitest.config.mjs docs/audits/AUD-022-harnesses/crypto-protocols.audit.test.ts --reporter=verbose
node docs/audits/AUD-022-harnesses/record-command.mjs my-scanner-probes -- pnpm exec vitest run --config docs/audits/AUD-022-harnesses/vitest.config.mjs docs/audits/AUD-022-harnesses/scanner-panel.audit.test.ts docs/audits/AUD-022-harnesses/scanner-import.audit.test.ts --reporter=verbose
node --experimental-vm-modules docs/audits/AUD-022-harnesses/mhfe-contract-probes.mjs
node --experimental-vm-modules docs/audits/AUD-022-harnesses/deriver-bip85-clear.mjs
node --experimental-vm-modules docs/audits/AUD-022-harnesses/deriver-mhfe-check-edit.mjs
node --experimental-vm-modules docs/audits/AUD-022-harnesses/deriver-backup-check.mjs
node --experimental-vm-modules docs/audits/AUD-022-harnesses/deriver-rekey-owner-lifetime.mjs
node docs/audits/AUD-022-harnesses/browser-layout.mjs my-layout
python3 docs/audits/AUD-022-harnesses/validate-report.py docs/audits/AUD-022-2026-10-06.json
```

Vitest exits nonzero for violated assertions. VM probes output JSON invariants and source hashes: exit 0 means all defined controls/invariants hold, exit 1 means product invariants fail, exit 2 means setup/source-binding errors. No real Worker, WASM or cryptographic work runs in those VM probes. Browser layout exits nonzero on a failed assertion or browser/setup failure; distinguish those causes. Report validation exits nonzero for invalid records. The initial audit had separate instrumentation/locator/note-link mistakes; retained failures must not be counted as product defects.

Evidence stays locally in ignored `docs/audits/AUD-022-evidence/`. The report/JSON carry the meaningful commands, results and hashes; evidence is not committed. Harnesses and report are prepared for review, but this audit did not authorize any commit or publication.
