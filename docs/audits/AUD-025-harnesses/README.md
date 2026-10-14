# AUD-025 harnesses

This targeted audit reviews chosen/excluded BIP39 words in the Deriver at commit `c5b62c2d489e7525326071128095ba95ecca92ac` plus the dirty working tree. The report records exact baseline and post-addition source fingerprints. Only public deterministic fixtures are used; no provider, full Argon2 or card-generation workload is required.

The `bits/`, `tests/` and `integration/` subdirectories describe independent reviewers' probes and test additions. Unit tests remain next to their affected feature. Run commands from the authoritative `multi-chain-wallet-tools` checkout, without another copy or worktree.

## Command recorder

The neighboring MHFE AUD-014 recorder is reused in place, not copied:

```sh
env AUDIT_ID=AUD-025 python3 ../mhfe/docs/audits/AUD-014-harnesses/run.py <label> <command> <arguments...>
env AUDIT_ID=AUD-025 python3 ../mhfe/docs/audits/AUD-014-harnesses/run.py <label> snapshot
```

The JSON companion pins this recorder's SHA256. It requires Python 3 and the sibling authoritative `mhfe` checkout. It retains exact argv, UTC times, exit codes, log SHA256 and sampled process-group RSS in ignored local `docs/audits/AUD-025-evidence/`. It refuses low-memory starts and stops only its own process group above a 3GiB sampled RSS budget or below a 2GiB available-memory reserve. Sampling is not a hard memory cap, nor evidence about earlier interrupted sessions (host out of memory). Run checks serially; this audit does not authorize a full release procedure.

Later build/browser commands additionally wrap their command in `node docs/audits/AUD-025-harnesses/memory-tree.mjs <command> <arguments...>`. This Linux/Node/Python guard follows PPIDs and birth times even across process groups, emits `ownedTreeMemory` JSON, and uses Python's `pidfd_open`/`pidfd_send_signal` to stop captured processes without a numeric-PID check-to-kill race. It also refuses a root command that leaves known live children behind. A short detached-child probe exits 0; a deliberately outliving child is terminated and returns 75 as an expected safety refusal. Sampling can miss short-lived or immediately reparented children, stops during bounded exit cleanup, and does not clean detached children on external termination. Procfs/Python pidfd support is required. RSS can double-count shared pages and omits swaps/cache; the first unit runs used only group sampling, and the report distinguishes those measurements. Only captured descendants are eligible for termination. This is a sampled soft guard, not a hard memory cap.

## Artifact manifest

```sh
env AUDIT_ID=AUD-025 python3 ../mhfe/docs/audits/AUD-014-harnesses/run.py artifacts-before /home/user/.local/bin/node docs/audits/AUD-025-harnesses/record-artifacts.mjs before
```

`record-artifacts.mjs` requires Node 26.10.0 and the existing vendored MHFE package. It uses the repository's inventory owner to verify every vendored `modules.json` file hash (the native launcher is intentionally not vendored), captures exact vendor and existing HTML hashes, and writes only ignored evidence. It checks file integrity against the present manifest, not an independent provenance pin; that has its own check. A stale general verification record is hashed, not treated as acceptance of current bytes. Success exits 0; a mismatch throws and exits nonzero. Rerun with `after` following targeted HTML builds. Neither command regenerates WASM or syncs a vendor package.

The existing provenance verifier also queries public upstream commit availability: its HTTP422 and local-uncommitted-vendor warnings are retained, not interpreted as signed-release provenance acceptance.

## Report assembly

After the coordinator's final source/artifact snapshots and commands exist, run `python3 docs/audits/AUD-025-harnesses/finalize.py` from the repository root (Python `jsonschema` is required). It builds the paired report from exact retained evidence, verifies the five authorized changed source paths, all source/procedure/harness/log hashes, JSON schema and unique keys, paired record IDs, all 32 procedure checks, new report links, and evidence exclusion from staging. `--validate-only` validates without rewriting the report. Success exits 0; an assertion/schema/hash failure exits nonzero. Evidence and generated damaged-KAT HTML fixtures remain ignored and local only.
