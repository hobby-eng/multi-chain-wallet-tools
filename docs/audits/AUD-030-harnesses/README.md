# AUD-030 remediation and MnemoCode parity harnesses

This directory supports AUD-030's authorized remediation and P01–P60 browser parity follow-up in the existing multi-chain-wallet-tools checkout. The starting HEAD is `c5b62c2d489e7525326071128095ba95ecca92ac` with substantial pre-existing changes. That commit alone does not identify the reviewed or remediated bytes. Preserve the local `parity-start` identity, source, diff and artifact records; bind subsequent checks to their own dirty-source snapshots. The owner reports the final production core frozen; the parent's final tests, source binding and acceptance reconciliation remain separate deliverables.

Use the canonical [execution guide](../../FULL_AUDIT_GUIDE.md), [audit standard](../AUDIT_STANDARD.md), [report template](../AUDIT_TEMPLATE.md) and [JSON schema](../../audit-report.schema.json). This README documents harness operation, not an executed audit or another report template. `P01`–`P60` are semantic obligations, distinct from the guide's `CHECK-*` tasks and immutable `AUD-030-*` finding IDs. Findings retain their original IDs and move from `fixed` to `verified` only with the required recorded verification.

## Inputs and responsibilities

- [run.py](run.py) is the local bounded-run entry point. It loads the neighboring `../mnemocode/docs/audits/AUD-017-harnesses/run.py`, which extracts recorder definitions from `AUD-014-harnesses/audit.py` without executing that historical CLI. It redirects new evidence to this audit and uses this checkout's `AUD-028-harnesses/capture.py` source-manifest definition. These are live dependencies on the existing neighboring checkout, not copied harness implementations; absence or incompatible definitions is an error.
- [vendor-binding.mjs](vendor-binding.mjs) reads the existing MnemoCode checkout, its owner handover snapshot, the sync allowlist and `packages/recovery-mnemocode/source.json`. It verifies each mapped source/target hash and commit binding without updating vendor files, running vectors or using the network.
- [parity-matrix.json](parity-matrix.json) and [parity-matrix.md](parity-matrix.md) map all 60 obligations from the sibling [semantic notes](../../../../mnemocode/docs/audits/AUD-021-harnesses/parity-notes.md). Their source states, anchors and supplied fingerprints are point-in-time evidence requiring final reconciliation. Enumeration, module existence and a visible control do not establish runtime parity.
- [report.py](report.py) generates and checks the paired AUD-030 report from retained final source, identity, artifact, matrix and command records. It imports the existing AUD-028/AUD-029 report helpers; it does not execute product checks or upgrade a partial batch into a passing replay.
- [privacy-README.md](privacy-README.md) owns the separate publication-privacy workflow for historical records. Its commands and results do not constitute AUD-030 product verification. Do not replay or combine that workflow with these checks.

Use only published BIP39/SSKR vectors and explicitly synthetic phrases, shares, passwords, addresses and metadata from the targeted fixtures. Never supply real wallet material. Keep the existing checkouts in place; do not clone, copy, install dependencies or change source to make a check pass. Use the configured Node 26.10.0/Corepack/pnpm 12.8.1 toolchain and Python 3 on Linux. Published home paths use `/home/user/...`; examples below use repository-relative paths. All recorded and published times are UTC.

The final owner input is the local-only `../mnemocode/docs/audits/AUD-021-evidence/remediation-final-05-snapshot.json`, identifying handover fingerprint `991f61a993042265cf6ed9575cddc5ab0d84e605fbf0a1aaa2fccb62120e468e` and upstream commit `8de80e24c7e98b14a443cb9a0e3dc43aa73a7917`. This fingerprint belongs to the upstream snapshot, not to the browser checkout, its HEAD or generated HTML. The binding checker reports the snapshot's fingerprint and validates the mapped files; it does not independently recompute the entire upstream fingerprint or enumerate CLI behavior. Earlier handovers and failed attempts remain historical evidence.

## Bounded commands

Run from the existing repository root only when the coordinator returns the shared execution queue. The following are targeted examples for that authorized slot, not commands executed while writing this README. Choose a fresh alphanumeric/hyphen label for every attempt, including retries.

```bash
python3 -B docs/audits/AUD-030-harnesses/run.py snapshot followup-before-01

python3 -B docs/audits/AUD-030-harnesses/run.py check vendor-final05-01 \
  node docs/audits/AUD-030-harnesses/vendor-binding.mjs \
  ../mnemocode \
  ../mnemocode/docs/audits/AUD-021-evidence/remediation-final-05-snapshot.json

python3 -B docs/audits/AUD-030-harnesses/run.py check types-followup-01 \
  pnpm exec tsc --noEmit

python3 -B docs/audits/AUD-030-harnesses/run.py check heir-metadata-followup-01 \
  pnpm exec vitest run \
  packages/recovery-backup/tests/mnemocode-heir-metadata.test.ts \
  apps/key-derivation/tests/mnemocode-heir-share-metadata.test.ts \
  --maxWorkers=1

python3 -B docs/audits/AUD-030-harnesses/run.py check card-job-followup-01 \
  pnpm exec vitest run apps/key-derivation/tests/mnemocode-card-job-lifecycle.test.ts \
  --maxWorkers=1

python3 -B docs/audits/AUD-030-harnesses/run.py snapshot followup-after-01
```

These focused fixtures use real metadata/delegation with passive or mocked drawing and deferred jobs. They do not perform actual PDF rendering, a gallery export, a vector replay or browser acceptance. The broad PDF card suite, full self-test, all-vector suites, builds, Docker, browser suites and full release verification are outside these examples and require the parent's separately scheduled scope.

`check` holds `/tmp/wallet-tools-heavy-check.lock` for cooperating runs. The inherited guard sets each Node heap to 768 MiB, requires at least 4 GiB of host available memory before starting, samples `/proc/meminfo` every 0.25 seconds and stops its child process group if available memory falls below 3 GiB or the deadline expires. The default deadline is 120 seconds; `AUD030_TIMEOUT_SECONDS` accepts 1–300 seconds. This is sampled host-memory protection, not a total-process memory limit. It cannot serialize commands that bypass the lock. `snapshot` does not take the execution lock; capture only while source is stable.

## Evidence and expected results

All outputs belong to ignored, local-only `docs/audits/AUD-030-evidence/`. A `snapshot LABEL` exclusively creates `LABEL-snapshot.json` with UTC time, HEAD, branch, working-tree state, source file hashes and fingerprint. A `check LABEL COMMAND...` exclusively creates `LABEL.log`, combines stdout/stderr there and writes `LABEL.command.json` with the command array, cwd, UTC start/end, exit code, stop reason, log SHA-256, memory samples/minimum, heap/reserve/deadline settings, before/after source fingerprints and changed-file list. Preserve both files and inspect the record, not just the displayed final line. Use a label unused by any existing evidence; retain interrupted records and logs rather than overwriting or deleting them.

The host source manifest covers Git-tracked and non-ignored untracked files and excludes `docs/audits/`; its fingerprint hashes the canonical sorted file-hash/path listing defined by `AuditCapture.source`. Audit documents, harness definitions and ignored output/artifacts therefore need separate SHA-256 bindings. For example, record the exact harness inputs with another fresh label:

```bash
python3 -B docs/audits/AUD-030-harnesses/run.py check harness-input-hashes-01 \
  sha256sum docs/audits/AUD-030-harnesses/README.md \
  docs/audits/AUD-030-harnesses/run.py docs/audits/AUD-030-harnesses/vendor-binding.mjs \
  docs/audits/AUD-030-harnesses/parity-matrix.json docs/audits/AUD-030-harnesses/parity-matrix.md \
  docs/audits/AUD-028-harnesses/capture.py \
  ../mnemocode/docs/audits/AUD-017-harnesses/run.py \
  ../mnemocode/docs/audits/AUD-014-harnesses/audit.py \
  docs/FULL_AUDIT_GUIDE.md docs/audits/AUDIT_STANDARD.md \
  docs/audits/AUDIT_TEMPLATE.md docs/audit-report.schema.json
```

The parent separately hashes final handover, manifest, evidence records/logs, procedure inputs and final artifacts. Source equality during a command does not prove that an existing artifact was built from those bytes. Keep raw local evidence intact; anonymize published command/path excerpts without altering results or UTC timestamps.

For the report generator's final input format, capture stable product bytes with the existing wallet recorder, rather than substituting `run.py`'s different snapshot envelope. These commands do not replay product checks:

```bash
python3 -B docs/audits/AUD-028-harnesses/capture.py . 30 parity-final --snapshot
python3 -B docs/audits/AUD-030-harnesses/report.py
python3 -B docs/audits/AUD-030-harnesses/report.py --check
```

The final capture writes `parity-final.source.json`, `.identity.json`, `.diff` and `.artifacts.json` exclusively. A repeated capture must use a new label and an explicit generator input update; never replace the retained files. Finish harness/matrix formatting before generating the report, then format the pair and use `--check` to validate the publication against retained inputs. The generator excludes its own report files from the product fingerprint and keeps document/harness bindings separate.

A completed successful command returns zero; the binding checker prints commit, handover/manifest hashes and mapped file hashes. A failed assertion, binding mismatch, memory refusal, timeout, crash or incomplete record must retain its actual outcome. The guard records pre-start memory refusal as exit 125; a stopped process can return its termination code. A missing completion record is not a pass. Also inspect `stopReason` and `changedFiles`: source changes invalidate a claim that one stable snapshot passed, and an interrupted check cannot become acceptance solely from its exit code.

Record observed file/case counts from each log, original failures and scoped reruns separately. Do not sum overlapping runs, infer coverage from a success count or assign parent-reported results to later edited bytes. No success total or fresh run is asserted by this README. All-60 static mapping, targeted tests, final source binding, enabled-feature/startup gates and real-browser acceptance in Multi-chain and Dash Community editions are distinct evidence. The parent owns the final ledger, source/artifact hashes, pending acceptance work and report conclusion; this documentation neither changes those records nor claims release acceptance.
