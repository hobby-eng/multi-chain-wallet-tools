# AUD-021 reproducible harnesses

These harnesses belong to the full HTML review of Multi-Chain Wallet Tools at commit
`2d2b7cce6e97958d45f1a69bf2a6a9e3db507760`, completed on 2026-10-03. They do not fix product
source, publish assets or create a release. Inputs are public fixtures and synthetic data.

Use the repository's Node 26.10.0 and pnpm 12.8.1 with its frozen dependencies installed. Run from
the repository root. Generated logs/command records belong only in the ignored sibling
`docs/audits/AUD-021-evidence/` directory.

## Availability probe

```sh
pnpm exec vitest run --config docs/audits/AUD-021-harnesses/vitest.config.mjs
```

`availability.audit.test.ts` imports actual production `fetchJson` and the existing Dash streamed
JSON reader. A stubbed `fetch` returns at most 22 one-MiB chunks of synthetic whitespace; one
reusable buffer is used. No remote service is contacted and no intentional host exhaustion is
attempted. The second test uses the same fixture and limit as a control.

At the reviewed commit, expect **exit 1: one failed, one passed**. The public-provider reader
consumes all 22 chunks, reports `cancelled:false`, then rejects the size. Its early-stop assertion
fails, reproducing AUD-021-SEC001. The Dash reader cancels before all chunks are emitted and
passes. After a correct streaming byte-limit fix, both safety assertions should pass; keep them
intact.

## Displayed dependency metadata

```sh
python3 docs/audits/AUD-021-harnesses/check-metadata.py
```

The script compares the rendered release-passport version with the canonical Orchard crate's exact
wasm-bindgen dependency pin. At the reviewed commit expect **exit 1: six metadata mismatches**:
Activity Viewer, Discovery Scanner and Deriver in both editions display 0.2.128, while the actual
pin and freshly verified outputs use 0.2.129. This reproduces AUD-021-DOC001. It inspects the
passport's exact phrase, not glue internals or the separate vendored MHFE package.

## Command recorder

```sh
node docs/audits/AUD-021-harnesses/record-command.mjs public-provider-availability -- pnpm exec vitest run --config docs/audits/AUD-021-harnesses/vitest.config.mjs
```

The recorder preserves the command's exit status and writes `<name>.log` and `<name>.command.json`,
including UTC timings and SHA-256. Names are exclusive: choose a fresh name for a justified
rerun; previous evidence is not overwritten. Pass public fixtures only, since command arguments
are retained. Only named toolchain/build environment fields are recorded.

## Artifact/source snapshot and report maintenance

`capture-final.py` needs the initial ignored `snapshot.json`, freshly copied canonical Docker
artifacts, browser JSON reports, layout results and five RustSec command logs. It checks all 872
initial tracked file hashes, compares the eight current native/canonical HTML files and fresh
canonical flat copies, binds browser-tested hashes to those files and records zero-vulnerability
RustSec results, including warnings. Run before adding the audit index entry. It does not approve
earlier native flat release folders, which `build:html` does not regenerate.

`build-report.py` uses retained evidence to assemble the paired Markdown/JSON report and its
32-row coverage ledger. It distinguishes source checks, the intentionally failing probe,
filtered/skipped tests and unexecuted work. It does not execute verification suites.

`finalize-review.py` requires the host's existing Python `jsonschema` package. It validates the
report schema and unique paired IDs, complete CHECK IDs, unchanged original source (allowing only
the audit index update), procedure/log/artifact hashes, report links and the evidence ignore rule.
It writes local validation evidence and a recursive SHA-256 manifest; it never commits files.

The actual uncached Docker, browser, vector, layout, dependency and formatter commands, with
outcomes and log hashes, are listed in the companion AUD-021 report. These tools require their
documented repository prerequisites; no real wallet inputs are needed.
