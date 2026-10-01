# AUD-020 audit harnesses

These audit-only harnesses record commands and validate evidence for AUD-020,
the full audit of the Multi-Chain Wallet Tools repository at reviewed commit
`c9bfa5b01e473c6cabb3aa2d7f898b32c4e3dcce`.

## Inputs and scope

The harness accepts commands supplied by the reviewer and runs them from the
repository root. Tests must use only published vectors and synthetic data. Do
not pass real wallet secrets, credentials, or private material. Any live
provider check must use the repository's documented public test fixtures and
must be reported separately from deterministic test results.

## Run

From the repository root:

```sh
node docs/audits/AUD-020-harnesses/record-command.mjs \
		<name> -- <command> <arg>...
```

For example:

```sh
node docs/audits/AUD-020-harnesses/record-command.mjs verify -- pnpm verify
```

The focused historical CSV regression probe runs with the repository aliases and
executes only the AUD-020 harness tests:

```sh
node docs/audits/AUD-020-harnesses/record-command.mjs \
		historical-api-regressions -- env AUDIT_LABEL=aud-020 \
		node_modules/.bin/vitest run \
		--config docs/audits/AUD-020-harnesses/vitest.config.mjs \
		docs/audits/AUD-020-harnesses/historical-api-regressions.audit.test.ts
```

The two synthetic cases intentionally assert the observed empty `balance_display`
for current Bitcoin/Ethereum finding shapes without `balanceUnit`. A passing test
reproduces the documented defect; it does not mean the behavior is accepted.

The remediation of 2026-10-02 found that these hand-built shapes skip the Scanner's
history step, which gives every finding its adapter's unit. On the real path the column
is filled; `apps/discovery-scanner/tests/export-balance-units.test.ts` covers it, and this
probe keeps passing because the exporter does not infer units from labels.

Each run creates `<name>.log` and `<name>.command.json` under
`docs/audits/AUD-020-evidence/`. The JSON record contains the exact argv,
working directory, UTC start/end, exit code or signal, a small allowlisted set
of build environment variables, and the log SHA-256. The evidence directory
is ignored by Git and must not be committed.

The recorder exits with the child command's non-zero status. A completed
command with exit code zero is not by itself proof of application correctness;
the audit report states what that command covers and what remains untested.
Use a unique lowercase name for each command because existing logs are never
overwritten.

After the report pair and index are final, run the evidence finalizer once:

```sh
node docs/audits/AUD-020-harnesses/finalize-evidence.mjs
```

It validates the Markdown/JSON pair against the report schema (including
duplicate JSON keys), checks local report links and procedure hashes, captures
the final source/environment snapshot, verifies evidence remains ignored and
unstaged, and writes `snapshot.json`, `environment.log`,
`procedure-hashes.json`, `report-validation.json`, its own command record, and
`SHA256SUMS`. It exits non-zero if any validation or checksum fails. Run it only
after all audit commands and report edits are complete.

## Expected results

The expected result is an accurate record, not a predetermined pass. Commands
may fail or be blocked; preserve their original output and report the outcome
without suppressing it. The audit reviewed commit is the commit above. Running
the harness against another snapshot does not update or replace AUD-020's
reviewed snapshot.