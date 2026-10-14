# AUD-031 handover and integration evidence

This is a scoped continuation of AUD-030 on the existing primary checkout, based on `6c9ee37ed53b2fcc57feb8591ca8bcea1c8a7aa7` with pre-existing dirty changes. It takes the frozen MnemoCode handover `1a6ac13763ec5ed799a115d038fc6f884b24086bb065a143d2061cd2bfb6b070` from the workspace's `tmp/mnemocode-remediation-2026-10-14/`. The report's final source manifest identifies the actual host bytes; the base commit alone does not.

`run.mjs` reuses the retained AUD-030/AUD-028 recorder and neighboring MnemoCode AUD-017/AUD-014 memory guard. Those existing files are dependencies, not copies. It serializes cooperating checks, sets a 768 MiB Node heap, requires 4 GiB available before starting, and stops its process group below a 3 GiB reserve or after 120 seconds. Preserve failed attempts and use fresh labels. The compatibility lock remains `/tmp/wallet-tools-heavy-check.lock`; new evidence goes to ignored AUD-031-evidence on disk.

`operations.mjs` maps each of the 37 incoming areas to actual controls, host owners and regression references. `parity.mjs` checks those references, expands the same wallet template used by the build, and verifies every mapped source/target against the frozen owner hashes. Eighteen asset/vector files absent from the source-only handover are checked against their retained pins, without replaying them. `vendor-input.json` must already contain those before-sync hashes; a changed asset is refused. The matrix is static source evidence, not a claim every scenario or browser was executed.

Run from the existing repository root with the configured Node/Corepack/pnpm and Python standard-library environment:

```bash
node docs/audits/AUD-031-harnesses/run.mjs FRESH-LABEL pnpm exec vitest run apps/key-derivation/tests/mnemocode-worker-protocol.test.ts --maxWorkers=1
node docs/audits/AUD-031-harnesses/run.mjs FRESH-PARITY-LABEL node docs/audits/AUD-031-harnesses/parity.mjs
python3 -B docs/audits/AUD-028-harnesses/capture.py . 31 final --snapshot
node docs/audits/AUD-031-harnesses/report.mjs
```

The parity checker exclusively writes `parity-final.json`; retain it and select a different output for a later follow-up rather than overwriting evidence. The final snapshot writes separate source, identity, diff and artifact records. `report.mjs` reads them, checks current source/row/log hashes, and emits the canonical Markdown/JSON pair with all 32 procedure dispositions. Formatting the report does not rerun product checks. Success returns zero; a mismatch returns nonzero.

Only public BIP39/SSKR data and synthetic controls are allowed. No real wallet material, browser execution, full vector replay, rendering gallery, paid CI, Docker, commit, push or release is part of these scripts. Four focused Deriver/Scanner HTML outputs are bound separately; older artifacts are excluded. Case counts and overlapping reruns remain separate in the report.
