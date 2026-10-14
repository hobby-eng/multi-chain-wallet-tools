# AUD-027 bounded remediation harnesses

These harnesses belong to AUD-027, reviewed HEAD `01e7913939574ccc94823e969e698e23cdb5fb0f` with a concurrently modified working tree. They exercise publication ordering and inventory ownership, not cryptographic correctness or release readiness. The report records exact source fingerprints and per-command manifests; rerunning on newer source creates new evidence, not a replay of the original bytes.

Run from the existing repository root, using its documented Node/pnpm toolchain. No checkout copy, browser, Docker, KDF, WASM compilation, network requests or rendered PDF/card outputs are needed by the scoped commands below. Inputs are synthetic or existing public test fixtures.

## Focused checks

- `pnpm exec vitest run docs/audits/AUD-027-harnesses/mhfe-late-publication.test.ts --config docs/audits/AUD-027-harnesses/vitest.config.ts`: the actual Check and rekey tabs behind synthetic clients; defer final parameters and assert no late verdict after edit or success after Cancel. On reviewed source both assertions fail. No secrets are generated or printed.
- `pnpm exec vitest run docs/audits/AUD-027-harnesses/scanner-export-generation.test.ts --config docs/audits/AUD-027-harnesses/vitest.config.ts`: the actual Scanner controller with its existing synthetic view/input fixtures. Start another normal scan before resolving/rejecting the previous export broker request; both no-stale-feedback assertions fail on reviewed source. No broker download or provider call executes.
- `node docs/audits/AUD-027-harnesses/mhfe-inventory.mjs`: only the real verification generator's AST-extracted inventory declarations and the real manifest owner run. Expected: 31 records including all 15 MHFE files, both Argon2 engines, refusal of a wrong pin, exit 0. The release-record entry point never runs.

The Vitest configuration replaces the repository include globs; it does not merge those globs. Always name the exact test file. Tests use one worker and a three-second timeout. Set `NODE_OPTIONS=--max-old-space-size=1536` for Node commands.

## Evidence and report handling

- `python3 -B docs/audits/AUD-027-harnesses/capture.py <fresh-name> <command> [arguments]` retains the command, UTC interval, exit, log hash and source manifests before/after execution in ignored `docs/audits/AUD-027-evidence/`. It refuses to overwrite a name and bounds unexpected hangs to 90 seconds. This is not authorization to select a full test suite.
- `python3 -B docs/audits/AUD-027-harnesses/validate.py docs/audits/AUD-027-2026-10-08.json` validates the JSON schema, paired IDs, 32 coverage references, 34 family keys, source/log bindings, procedure hashes, path normalization and retained harness syntax. Original local evidence must be present for hash validation.
- `create-report.py` is the original report generator. It requires the coordinator baseline, command logs/records and three local scoped review sidecars plus coordinator notes. It anonymizes home paths before publishing; local originals remain unchanged. It refuses to overwrite a completed report. Do not run it to silently replace historical results or to turn source-only observations into verified fixes.

The retained initial widened-config timeout and incomplete seal-fixture attempt are diagnostics, excluded from accepted test totals. The accepted complete fixture preserves supported result fields. Four copy-detector unit failures have a separately reproduced `spawnSync EPERM` environment limitation; no tokenizer defect or copy-check pass is inferred from them.

Only reports and these harnesses were added by the original review. No product fix, signed commit or release was performed during that baseline.

## Authorized remediation phase

The owner subsequently authorized all fixes. The appended phase records working HEAD `c5b62c2d489e7525326071128095ba95ecca92ac`, the dirty source fingerprint, scoped product changes, all command outcomes and fresh local HTML hashes. The baseline sections and original failed evidence remain historical; current bounded verification does not certify release readiness.

- `append_remediation.py` consumes `remediation-baseline.json`, all fresh `remediation-*.command.json` and matching local logs/source manifests. It verifies required successful commands, current artifact hashes, and the normal MnemoCode sync, then appends one dated phase to the existing AUD-027 pair. It refuses to replace an existing phase. Run `python3 -B docs/audits/AUD-027-harnesses/append_remediation.py` only after the bounded commands named in that script finish; it writes no product source and executes no build.
- `python3 -B docs/audits/AUD-027-harnesses/validate.py docs/audits/AUD-027-2026-10-08.json` now also validates the appended phase, unchanged historical findings/snapshot/checks, current source/owner/artifact hashes, anonymized commands against their original local records, and absence of tracked evidence. Expected: baseline and remediation validations pass, exit 0; validation and checksum results stay local.
- Added product regressions live beside their modules: MHFE run/input/parameters/Encode/New wallet/hidden sessions; shared worker resource failures; exact sums, history budgets/proof reconciliation/viewing admission; PSBT locks; fast injected BIP38/RNG/EIP55 owners; catalog bootstrap, version refusal and staging cleanup. Their exact bounded invocations/counts are in the report's appended JSON phase. No full vector, expensive KDF, browser, Docker, native/WASM regeneration or PDF/card rendering is part of these commands.

The later AUD-026 remediation changed the live source and rebuilt the HTML again. To validate
AUD-027 as historical evidence, use
`python3 docs/audits/AUD-027-harnesses/validate.py docs/audits/AUD-027-2026-10-08.json --historical`.
This mode checks the retained source manifest and hashed command logs; it does not claim that the
old artifact hashes describe the current HTML. The historical procedure is also checked against
the recorded Git HEAD when the live guide has changed. The default mode still requires live bytes.
