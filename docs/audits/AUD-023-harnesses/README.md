# AUD-023 audit harnesses

These files belong to audit AUD-023 of multi-chain-wallet-tools; see the [report](../AUD-023-2026-10-07.md). The reviewed source is HEAD `c5b62c2d489e7525326071128095ba95ecca92ac` plus an uncommitted working tree, identified by source manifests rather than by a commit: the baseline manifest fingerprint is `8e8649c9059d2bdeb84d5eccb2d1191142888c0c32601df1276116d640b873aa` (1091 paths), and the remediation tree on which the final checks ran is named in the report. HEAD alone is not the tested source.

Run every command from the repository root with Node 26.10.0 and pnpm 12.8.1 and the installed, pinned dependencies. Inputs are public test data only: `abandon … about`, published vectors (BIP38, BIP-322, BIP380, BCR-2020-011), the private key 1 and synthetic lists. Nothing here needs a real wallet, full-size Argon2, a Docker build or GitHub Actions. Browser and build scripts are heavy: wrap them in `flock docs/audits/AUD-023-evidence/heavy.lock` so that only one runs at a time.

Shared tools:

- `record-command.mjs <unique-name> -- <command> [args...]` runs one command and keeps a local `.log` and `.command.json` in `docs/audits/AUD-023-evidence/` (ignored by git): exact argv, UTC interval, exit code, log SHA-256 and the build source fingerprint before and after. It stops the command's process group when the host's available memory falls below 700 MiB. Names must be unique; it refuses to overwrite.
- `capture-snapshot.py [--name <unique-name>]` hashes every tracked and untracked non-ignored path in place (AUD-023 files excluded) into `snapshot[-name].json` with one fingerprint. No checkout is copied.
- `validate-report.py <json-path>` validates the report against `docs/audit-report.schema.json` without duplicate keys, the paired Markdown (finding headings and register, snapshot, 32 check IDs, links), every command record's log hash, the procedure, finding source and artifact hashes, and that no evidence file is staged. It writes `report-validation.json` locally. An audit-record check, not a product test.

Coordinator:

- `coordinator-repaired-shares.mjs` checks the required verification of AUD-023-API001 on the built pages of both editions in Chromium and Firefox: a 2-of-3 word split of the public test phrase, a repair of share 2 with its 8th element marked `?`, the repaired shares saved as a text file (exactly the two shares, one per line), and the repaired shares printed as cards at A6 and A4 (PDF) and business-card size (ZIP), with nothing stored and no request. Input: `dist/` from `pnpm build`. Command: `flock docs/audits/AUD-023-evidence/heavy.lock node docs/audits/AUD-023-harnesses/coordinator-repaired-shares.mjs` (`BROWSER_ENGINES` narrows the engines). Expected on the remediation tree: `40/40 checks passed.`, exit 0. It was written after the remediation; at the reviewed snapshot the repair offered neither output.
- `coordinator-help-count.mjs` opens Recover & Back Up in both built Derivers and counts its help popovers: 27 since Decode's question for codes marked `?`, which the regression case `recovery-backup-roundtrips` now expects. Input: `dist/`. Command: `node docs/audits/AUD-023-harnesses/coordinator-help-count.mjs`. Expected: two lines with 27, exit 0. A few seconds; the whole case waits for the release.

Per reviewer, with what each script checks, its inputs, the exact command and the expected output and exit code:

- [remediation-README.md](remediation-README.md): reruns of the AUD-022 reproductions against their fixes (Vitest probes, node:vm control-flow probes bound to the baseline bytes, a browser probe of the Restore list to the Scanner).
- [selftests-README.md](selftests-README.md): the startup and full self-tests of the four tools (independent recomputation of known answers, mutation tests, browser runs with injected failures, composition of selective builds, the heavy-job gate, the Scanner's gate, Firefox).
- [mnemocode-README.md](mnemocode-README.md): the MnemoCode adoption (byte comparison with the upstream commit, coin-address evidence against an independent derivation, browser probes of the recovery panels).
- [build-README.md](build-README.md): selective builds and their startup, Dash text, builder paths in WebAssembly, provenance refusals under CI, release workflows, documentation links.

Several scripts were adapted after the remediation, because their expectations described the reviewed snapshot (for example a module that the remediation split per coin, or a limit that it closed). Each says so at its top and in its README section; the records of their runs at the baseline stay as they were.

Exit codes: Vitest exits non-zero when an assertion fails; the other scripts exit 0 when every check holds, 1 when a product check fails and 2 for a setup or source-binding error (the node:vm probes stop with 2 when a file they load differs from the baseline manifest, by design). Evidence stays local; the report carries the commands, results and hashes a reader needs.
