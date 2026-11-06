# AUD-033 CORE migration baseline harnesses

These scripts belong to the scoped coding-guide baseline of 2026-10-15 at commit `8bdd37a0dd94351b44018367bf628dfc902bc814` with the dirty source fingerprint recorded in the report. They do not run wallet cryptography, browsers or a release build, and do not change production files.

Run from the repository root with the pinned Node/TypeScript dependencies installed:

```sh
node docs/audits/AUD-033-harnesses/core-inventory.mjs
```

The inventory uses TypeScript 7.0.2's installed syntax API and writes ignored local evidence in `docs/audits/AUD-033-evidence/`. It enumerates owned code, styles and templates in `apps/`, `packages/`, `tooling/`, `test/` and root TS/MJS files. It excludes generated/synced source, notices, fixtures, dependencies, build outputs and retained audits. It exits nonzero if a requested TS/JS input has no parsed source. Exit zero means the inventory completed, not that the guide is satisfied. Function spans include blank lines, nested callbacks and test wrappers; they are not oxlint-equivalent failure counts. The import graph covers static declarations resolved against the root aliases, with omitted-edge counts and no dynamic/virtual-module claim.

The report generator consumes the retained `snapshot.json`, `inventory.json`, `import-graph.json` and `procedure-hashes.json` from that evidence directory. The snapshot is the baseline's non-audit `git ls-files --cached --others --exclude-standard` set with SHA-256 per input; it excludes ignored files. Snapshot and command records are local evidence, not public source inputs. Do not replace them to make a later source pass the historical validator.

```sh
node docs/audits/AUD-033-harnesses/report.mjs
python3 docs/audits/AUD-033-harnesses/validate.py
```

The generator rewrites only the paired AUD-033 report. Validation uses Python's standard library, checks every validation keyword used by the repository's schema envelope, refuses four malformed-record controls, checks paired finding IDs, accounts for all 32 procedure checks, verifies procedure/source/command hashes and local links, and writes local `report-validation.json` and `SHA256SUMS`. A changed source correctly fails historical validation. Successful validation prints the eight paired findings and exits zero; every refused invariant exits nonzero.

The baseline also executed `pnpm check` (passed) and `node ../.github/scripts/verify-action-pins.mjs .` (exit 1, 22 mismatches). Their exact UTC command records and log hashes are local evidence. No tool installation or network request is needed to repeat the inventory; the shared action checker requires the sibling workspace rules. The Markdown and JSON reports contain the reviewed source fingerprint, results, limitations and work estimate without depending on local evidence links being publicly downloadable.
