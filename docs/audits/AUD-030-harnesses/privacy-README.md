# AUD-030 publication privacy harness

`privacy.py` belongs to the owner-authorized privacy-only documentation update of multi-chain AUD-001 through AUD-029 and Dash AUD-001 through AUD-002. It uses the existing checkouts in place and Python's standard library only. It does not review product source, replay an audit, rebuild artifacts or change Git history. The parent's AUD-030 report and main harness README are outside its scope.

Every paired historical record gains explicit **Report time zone: UTC (+00:00)** metadata and a provenance note. Existing UTC timestamps, including `Z` timestamps, retain their exact values and spellings; date-only records retain their precision. No clock value is inferred. Published machine-owner paths must use `/home/user/...`. The input scan found no owner-name or home-path disclosures in the owned reports, so this update does not claim additional historical redactions or alter clock values. Historical `/home/runner` strings explicitly attributed to upstream public CI remain part of the original findings; they are not machine-owner disclosures.

Original findings, status, counts, commands, reviewed commits, procedure hashes, source fingerprints, source manifests and artifact hashes retain their meaning. No check is claimed to have rerun. Each record retains the SHA-256 of its pre-edit Markdown and JSON publication bytes. The old values of the explicitly rebound document references are retained in `privacyProvenance.originalDocumentBindings`, with their exact JSON pointers and repository-relative targets. `AUD-029-harnesses/report.py` retains its original baseline anchors in `HISTORICAL_BASELINES`; its `BASELINES` anchors identify the current privacy-edited publications.

## Inputs and local evidence

Run from the existing multi-chain checkout. The script locates both repositories relative to itself; no machine-owner path is embedded in the script. It requires exactly one existing Markdown/JSON pair for each owned audit number, both audit indexes, `AUD-029-harnesses/report.py`, and this harness and README. It does not import or execute a historical harness.

The one-time `apply` step exclusively creates `docs/audits/AUD-030-evidence/privacy/before.json` and its checksum. This ignored local snapshot retains original document bytes and hashes; it is separate from every original audit's raw evidence. Existing initialization is an error, so `apply` cannot silently replace retained provenance. Mutation records and completion manifests use exclusive, unique filenames and record the actual command, UTC execution time, harness hash, before/after hashes and resulting document hashes. A planned mutation record without its completion companion identifies an interrupted or failed attempt; do not present it as successful. Original evidence and previous privacy records are never overwritten.

## Commands and ordering

The initial metadata edit is a one-time step:

```bash
python3 -B docs/audits/AUD-030-harnesses/privacy.py apply
```

Document formatting belongs to the parent's shared check queue. Do not run it concurrently with document edits or rebinding. From the existing multi-chain checkout, use the repository's configured Node/Corepack/pnpm toolchain:

```bash
readarray -t privacy_documents < <(python3 -B docs/audits/AUD-030-harnesses/privacy.py format-paths)
pnpm exec prettier --write "${privacy_documents[@]}"
python3 -B docs/audits/AUD-030-harnesses/privacy.py rebind
python3 -B docs/audits/AUD-030-harnesses/privacy.py check
pnpm exec prettier --check "${privacy_documents[@]}"
```

`format-paths` only prints the owned Markdown and JSON paths, including the two Dash pairs and index; it does not launch a formatter. The parent's other formatting must finish before `rebind`. If later formatting changes any target bytes, repeat only `rebind` and `check`. Rebinding replaces only explicitly located SHA-256 string values and preserves surrounding formatted JSON and Python bytes. A repeat with stable inputs changes no publication file and appends a fresh local command record.

Before the parent's formatting, `python3 -B docs/audits/AUD-030-harnesses/privacy.py check-content` checks UTC metadata, retained provenance, the dependency graph and unchanged substantive JSON without requiring final current document bindings. It is read-only and does not report that rebinding passed.

The document dependency graph orders audit 24 before audit 27 before audit 26, and the multi-chain audit 28 and Dash audit 1 before the historical harness anchors and their audit 29/audit 2 dependents. The script rejects missing or unauthorized targets, self-references and cycles before rebinding. Audit 29's existing `harnesses` map also binds the changed `AUD-029-harnesses/report.py` bytes; its original hash remains in privacy provenance. Neither the new privacy harness nor a record's current self-hash is added to a historical manifest.

Expected successful output names the stage and changed-file count, then reports 31 pairs with unchanged substantive JSON, UTC metadata, provenance and current document bindings. `check` is read-only and exits nonzero on errors. `rebind` checks substantive preservation before writing and performs the same lightweight checks afterwards. JSON comparison removes only the two added metadata fields and restores only the allowlisted document-binding values before comparing the complete data with the retained original. The harness AST comparison permits only the original/current baseline assignments; all other historical generator code must remain equivalent.

These are documentation checks. They do not establish present source, runtime, artifact, release or browser correctness. Existing historical validators that demand an exact original publication prefix or compare documentation against a retained source manifest can still report differences after a privacy edit; those raw baselines and historical failures remain intact. No source/baseline validator replay is part of this patch, and no historical assertion is relaxed to claim a new pass.
