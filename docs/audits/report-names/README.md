# Report file names: AUD-NNN-&lt;date&gt;

On 2026-10-14 the owner chose one file name form for the audit reports of every repository in the workspace: `AUD-NNN-<date>.md` and `.json`, with the three-digit audit number and the UTC completion date. This folder holds the documentation-only migration that renamed the reports of this repository and of `dash-wallet-tools` from `audit-NN-<date>`.

No audit was replayed. Findings, statuses, counts, commands, reviewed commits, source manifests and artifact hashes keep their meaning; only names and the document hashes that bind the renamed or edited documents changed.

- [rename.py](rename.py) renames the 64 report files (`git mv` where Git tracks them), rewrites every reference to a report name in both repositories (mhfe's renamed reports included), rewrites the nine historical harness lines that build a report name from parts, and rebinds the SHA-256 values with which records name another document or harness under `docs/audits`. Hashes of files outside `docs/audits` are never rebound: there they describe a reviewed snapshot. Local evidence folders and `procedure-changes.json`, which quotes the old standard exactly, are left alone.
- [record.json](record.json) lists every rename, every edited file with its SHA-256 before and after the migration, and every rebound value with its old and new hash.

Commands, from the repository root:

```bash
python3 -B docs/audits/report-names/rename.py check
```

`check` exits 0 when no file keeps an old name, no text names a report the old way and every JSON record under `docs/audits` parses. `plan` prints what `apply` would do; `apply` ran once and refuses to run again while `record.json` exists.

A later edit of documents that records bind is recorded the same way: `rename.py snapshot <file>` before it and `rename.py rebind <file> <stage>` after it append the changed files and rebound values to [record.json](record.json) under that stage. The rules live once in [report_names.py](report_names.py), which both `rename.py` and historical validators use.

The historical validators work with the new names:

- AUD-030's `privacy.py check` translates the old names of its retained local snapshot and applies the migration's edits to the retained bytes (`report_names.migrated`) before comparing; a change beyond them is still an error.
- The AUD-028 and AUD-029 validators find a report by its audit number, check procedure files through [procedure_changes.py](../procedure_changes.py), and with `--historical` compare the records with their retained snapshot and evidence through [retained_evidence.py](../retained_evidence.py) instead of the live tree, which has moved on since; without it they still compare the live tree, as written.

AUD-027's `validate.py --historical` still stops where it requires the Markdown to begin with the exact original publication: AUD-030's privacy edit inserted its time-zone line into the metadata section, before this migration.
