# AUD-028 baseline harnesses

These scripts belong to AUD-028, a full-scope audit with incomplete release and browser execution, reviewed at commit `c5b62c2d489e7525326071128095ba95ecca92ac` plus the dirty source identified in the paired report. They are audit probes, not application inputs or release assets. Production source, dependencies, fixtures and generated WASM remain unchanged.

## Inputs and safety

- Use the primary checkout, installed locked dependencies and the workspace toolchains.
- All wallet material is public or synthetic. Do not supply a real wallet, passphrase, key or backup.
- `capture.py` excludes `docs/audits/` from its source manifest, records every other Git-visible file and preserves original logs, UTC intervals and source hashes.
- Commands share `/tmp/wallet-tools-heavy-check.lock`, have a default 120-second ceiling and run with a 1536 MiB Node heap and one Cargo build job. The monitor checks available host memory every 200 ms and stops its child process group when less than 1200 MiB remains. Other sessions must cooperate with the same lock; sampling is not a hard global memory guarantee.
- Browsers, canonical Docker/WASM regeneration, full-size KDFs, full vector/statistics series, real providers and bulk PDF/card output are excluded. One accidentally selected statistics series timed out; its original incomplete log is retained and excluded from test totals.

## Running

From the repository root:

```sh
python3 docs/audits/AUD-028-harnesses/capture.py . 28 fresh-name pnpm check
python3 docs/audits/AUD-028-harnesses/capture.py . 28 fresh-snapshot --snapshot
python3 docs/audits/AUD-028-harnesses/capture.py . 28 fresh-inputs node docs/audits/AUD-028-harnesses/inputs.mjs
python3 docs/audits/AUD-028-harnesses/capture.py . 28 fresh-probes pnpm exec vitest run --config docs/audits/AUD-028-harnesses/vitest.config.mjs --maxWorkers=1 --reporter=verbose
```

Use a fresh evidence name each time: existing evidence is never replaced. The bounded probe configuration discovers only this audit's `*-probe.test.ts` files, reusing product aliases. An assertion of an intended contract can fail on the audited baseline; a passing exploit observation demonstrates the insecure behavior, not remediation. The report distinguishes both. Each probe documents mocks, controls and known limits. Network-facade fixtures are analyzed as syntax and never executed.

`inputs.mjs` compares the recorded and actual canonical WASM records and checks Dash distribution document hashes. Its optional argument selects the existing Dash checkout; the default is the sibling `../dash-wallet-tools`. It writes no product files.

The paired report identifies original harness initialization failures, sandbox-blocked checks and their scoped reruns. Read them before interpreting an exit code. The final report validator checks the JSON schema, Markdown agreement, procedure/source/evidence hashes, source stability, privacy and that evidence remains ignored and unstaged.

## Probe and report inputs

- `security-probe.test.ts`, `public-probe.test.ts` and `architecture-probe.test.ts` contribute 52 bounded cases with actual production admission/normalization and explicit stub boundaries.
- `deriver-probe.test.ts` contributes 22 component/controller cases. Its original run hash differs from the revised Decode/Silent Payments assertions; the paired report preserves both execution identities and counts the subset as a follow-up.
- `envelope-probe.test.ts` and `crypto-probe.test.ts` contribute 12 actual committed-WASM cases. They use public/synthetic data, small recipient/SSKR operations, Codex32 symbol projection and one-address Orchard derivation. No password KDF or decryption demonstration without a private key is executed. `synthetic-ur.ts` owns the small fixture transport.
- On this audited baseline, the final crypto group has four passes and eight failing contract assertions. The original Deriver group has one pass and 21 failures; the stronger 11-case follow-up has one pass and ten failures. Failures are expected evidence of open findings, not passing acceptance.
- `base-findings.json`, `deriver-findings.json`, `crypto-findings.json`, `report-notes.json`, `coverage.json` and `recommendations.json` own the challenged conclusions. `report.py` derives stable categorized IDs and paired canonical Markdown/JSON reports from these inputs and the original local evidence. It refuses changed production source or procedure bytes.
- `validate.py` needs Python's existing `jsonschema` package and the retained original evidence. It validates both reports, hashes the local evidence into ignored `SHA256SUMS`, and records exact report hashes in ignored `report-validation.json`. It does not replay application tests or change production files.

After preparing the current audit inputs, generate, format and validate from the primary multi-chain checkout:

```sh
python3 docs/audits/AUD-028-harnesses/report.py
pnpm exec prettier --write docs/audits/AUD-028-2026-10-12.md docs/audits/AUD-028-2026-10-12.json ../dash-wallet-tools/docs/audits/AUD-001-2026-10-12.md ../dash-wallet-tools/docs/audits/AUD-001-2026-10-12.json
python3 docs/audits/AUD-028-harnesses/validate.py
```

After the working tree has moved on from the reviewed snapshot, run it with `--historical`: it then compares the records with what they and the local evidence retained (`docs/audits/retained_evidence.py`): the source manifest against its own fingerprint, bound file hashes against that manifest, artifacts against a retained artifact snapshot, and the files listed in the retained `SHA256SUMS`. It does not compare the live tree and writes no evidence file. Procedure files are checked through `docs/audits/procedure_changes.py` in both modes, and each report is found by its audit number, whatever its date.

```sh
python3 docs/audits/AUD-028-harnesses/validate.py --historical
```

Public readers can rerun the bounded probes without the private evidence folder. Regenerating these exact historical reports requires the original baseline evidence and unchanged source snapshot; a later remediation needs its own evidence instead of overwriting original logs.

## Evidence

Command logs, source and artifact snapshots, reviewer notes, observation records and checksums live only in ignored `../AUD-028-evidence/`. Reports and harnesses are reviewable files; this audit does not authorize committing them. Hashes and exact sanitized commands are carried by the report so that a public reader does not need access to the machine-local evidence folder.
