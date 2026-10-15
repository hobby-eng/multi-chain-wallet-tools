# AUD-032 integration follow-up harnesses

These scripts verify the local MnemoCode AUD-026 handover in the existing wallet-tools checkout at `0447031318ad4ae529f8552a3d31d88d3a70e090` plus the uncommitted fixes recorded by the report. They do not execute a real browser or a release build. Runtime evidence is local and ignored under `docs/audits/AUD-032-evidence/`.

## Inputs

Use Node.js 26.10.0, pnpm 12.8.1, the repository's pinned dependencies and Python's standard library. The retained recorder in AUD-030 delegates memory limits to MnemoCode's AUD-017/AUD-014 recorder in the adjacent authorized checkout. Keep that checkout and its retained scripts available; no second checkout is created. Synthetic buffers, public BIP39/SSKR answers and fake DOM/worker boundaries are the only runtime inputs.

The local incoming source manifest and handover are retained as `incoming-source.json` and `incoming-handover.md`. The frozen upstream fingerprint is `7593bf66fa328ca1d0ff87dc721ae7a8f730931949137c3b9e4e4d34fe1a0947`. The portable map is owned by `tooling/sync-mnemocode-source.mjs`; the ten-pin bridge/notice closure is owned by `tooling/sync-mnemocode-sskr.mjs`. Current default Deriver and Scanner HTML files in both edition folders under `dist/` are required for parity. Node-only aggregators are classified as injected host services rather than imported browser modules.

## Commands from the repository root

```sh
node docs/audits/AUD-032-harnesses/run.mjs snapshot fresh-snapshot
node docs/audits/AUD-032-harnesses/run.mjs fresh-check pnpm check
node docs/audits/AUD-032-harnesses/parity.mjs fresh-parity.json
node docs/audits/AUD-032-harnesses/report.mjs
node docs/audits/AUD-032-harnesses/validate.mjs docs/audits/AUD-032-2026-10-14.json
```

Choose fresh labels and output names: command/snapshot/parity evidence refuses overwrite. `run.mjs` uses the shared heavy-check lock, one Node heap of 768 MiB, a 3 GiB host reserve and the retained bounded command recorder. All checks in this follow-up use one Vitest worker. The paired report includes the exact named test paths/commands; do not replace them with a full suite, full vectors or a PDF gallery. The explicit existing pnpm store option in retained commands avoids sandbox-triggered dependency reinstall; it does not change global configuration.

`parity.mjs` verifies every frozen source hash, all mapped vendor files and bridge inputs, all 59 package export entries, 38 input/outcome areas and the real compiled controls of both editions. `contracts.mjs` distinguishes end-user inputs/outcomes from shared services. `findings.mjs` owns the six confirmed host findings. Regression references in the matrix are not claims that every case ran. The final named run contains 24 test files and 329 cases.

The report generator requires the retained `final` source/identity snapshot and source-bound final acceptance commands; it writes the canonical Markdown/JSON pair for its UTC date. The validator reuses hash-checked strict-key/schema definitions from the retained AUD-031 harness without executing that old harness's verification body or modifying its bytes. It checks source, artifacts, operation references, command/log and procedure/harness hashes and writes local `SHA256SUMS` and `report-validation.json`.

Success prints a scoped summary and exits zero. A changed input, missing control, stale binding, missing command, failed named acceptance check or invalid report exits nonzero. The separate wallet-tools canonical WASM gate intentionally fails after the imported SSKR 0.1.7 upgrade until its required canonical rebuild is authorized and completed; these scripts never waive it. Browser, full-vector/gallery, native PTY, Rust/Docker and release acceptance remain excluded.
