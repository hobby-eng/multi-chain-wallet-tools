# Audit records

Audit files use one global chronological sequence. Markdown and JSON files with the same number belong to the same review. New reports record the reviewer model and reasoning-effort level. Historical reports retain only metadata that was actually recorded; an unknown model or effort is marked as unknown rather than inferred.

For execution scope, categorized checklists, edge cases, and evidence requirements, follow [FULL_AUDIT_GUIDE.md](../FULL_AUDIT_GUIDE.md).

New audits must follow [the audit report standard](AUDIT_STANDARD.md) and [the report template](AUDIT_TEMPLATE.md). Finding IDs include a category, for example `AUD-018-DOC001` or `AUD-018-SEC001`; severity and remediation status are separate fields. Historical labels have been migrated; use [the alias mapping](LEGACY_FINDING_IDS.md) to resolve older references. Every numbered report has Markdown and JSON companions. The 2026-09-18 normalization changes presentation and identifiers, not the original audit execution or results.

1. [AUD-001](AUD-001-2026-09-08.md) · [JSON](AUD-001-2026-09-08.json) — 2026-09-08
2. [AUD-002](AUD-002-2026-09-08.md) · [JSON](AUD-002-2026-09-08.json) — 2026-09-08
3. [AUD-003](AUD-003-2026-09-09.md) · [JSON](AUD-003-2026-09-09.json) — 2026-09-09
4. [AUD-004](AUD-004-2026-09-12.md) · [JSON](AUD-004-2026-09-12.json) — 2026-09-12
5. [AUD-005](AUD-005-2026-09-12.md) · [JSON](AUD-005-2026-09-12.json) — 2026-09-12
6. [AUD-006](AUD-006-2026-09-12.md) · [JSON](AUD-006-2026-09-12.json) — 2026-09-12
7. [AUD-007](AUD-007-2026-09-12.md) · [JSON](AUD-007-2026-09-12.json) — 2026-09-12
8. [AUD-008](AUD-008-2026-09-12.md) · [JSON](AUD-008-2026-09-12.json) — 2026-09-12
9. [AUD-009](AUD-009-2026-09-12.md) · [JSON](AUD-009-2026-09-12.json) — 2026-09-12
10. [AUD-010](AUD-010-2026-09-15.md) · [JSON](AUD-010-2026-09-15.json) — 2026-09-15
11. [AUD-011](AUD-011-2026-09-15.md) · [JSON](AUD-011-2026-09-15.json) — 2026-09-15
12. [AUD-012](AUD-012-2026-09-17.md) · [JSON](AUD-012-2026-09-17.json) — 2026-09-17
13. [AUD-013](AUD-013-2026-09-17.md) · [JSON](AUD-013-2026-09-17.json) — 2026-09-17
14. [AUD-014](AUD-014-2026-09-17.md) · [JSON](AUD-014-2026-09-17.json) — 2026-09-17
15. [AUD-015](AUD-015-2026-09-17.md) · [JSON](AUD-015-2026-09-17.json) — 2026-09-17
16. [AUD-016](AUD-016-2026-09-17.md) · [JSON](AUD-016-2026-09-17.json) — 2026-09-17
17. [AUD-017](AUD-017-2026-09-17.md) · [JSON](AUD-017-2026-09-17.json) — 2026-09-17
18. [AUD-018](AUD-018-2026-09-29.md) · [JSON](AUD-018-2026-09-29.json) — 2026-09-29
19. [AUD-019](AUD-019-2026-10-01.md) · [JSON](AUD-019-2026-10-01.json) — 2026-10-01
20. [AUD-020](AUD-020-2026-10-01.md) · [JSON](AUD-020-2026-10-01.json) — 2026-10-01
21. [AUD-021](AUD-021-2026-10-03.md) · [JSON](AUD-021-2026-10-03.json) — 2026-10-03
22. [AUD-022](AUD-022-2026-10-06.md) · [JSON](AUD-022-2026-10-06.json) — 2026-10-06
23. [AUD-023](AUD-023-2026-10-07.md) · [JSON](AUD-023-2026-10-07.json) — 2026-10-07
24. [AUD-024](AUD-024-2026-10-08.md) · [JSON](AUD-024-2026-10-08.json) — 2026-10-08
25. [AUD-025](AUD-025-2026-10-08.md) · [JSON](AUD-025-2026-10-08.json) — 2026-10-08; chosen-word bit boundaries, constrained sampling, tests and startup checks
26. [AUD-026](AUD-026-2026-10-09.md) · [JSON](AUD-026-2026-10-09.json) — 2026-10-09; full compact-team audit of the uncommitted tree (AUD-024 remediation, MHFE 6a91d106 adoption, AUD-025 additions); later authorized remediation corrects all 32 findings (22 verified, 10 fixed with explicit acceptance gaps), with current local HTML and retained original evidence
27. [AUD-027](AUD-027-2026-10-08.md) · [JSON](AUD-027-2026-10-08.json) — 2026-10-08; bounded remediation verification, remaining semantic duplication and MHFE/MnemoCode handoff; its completed consolidation phase is historical after the later AUD-026 corrections and rebuild
28. [AUD-028](AUD-028-2026-10-12.md) · [JSON](AUD-028-2026-10-12.json) — 2026-10-12; full scope with bounded execution, 28 confirmed open roots, Envelope recipient/passphrase validation, recovery handoff, shared-code ownership and build blockers; paired Dash distribution review is AUD-001 in its repository
29. [AUD-029](AUD-029-2026-10-12.md) · [JSON](AUD-029-2026-10-12.json) — 2026-10-12; verified remediation of all 28 AUD-028 roots and the AUD-026-DOC001 recurrence at uncommitted source bytes, canonical WASM regeneration and eight default HTML pages; targeted checks only, no release acceptance
30. [AUD-030](AUD-030-2026-10-13.md) · [JSON](AUD-030-2026-10-13.json) — 2026-10-13; MnemoCode P01–P60 integration follow-up, exact 175-file owner binding, literal secret-file and delayed private QR corrections, bounded checks and eight fresh default HTML pages; partial-batch failures and scoped reruns retained, no real-browser or release acceptance

Historical findings describe only the reviewed snapshot. Use the latest audit and the `dist/verification-record.json` emitted for the build being evaluated.

## Procedure changes

Each record pins the SHA-256 of the procedure files it followed. When one of them is edited later, [procedure-changes.json](procedure-changes.json) records the edit with its exact reverse edit, and every validator checks the pinned hash through [procedure_changes.py](procedure_changes.py), which recovers the audited bytes from the current file. The records keep the hashes they were reviewed with.

## Report file names

Every report is named `AUD-NNN-<date>.md` and `.json`: the three-digit audit number and the UTC completion date, the form of every repository in the workspace. Reports written as `audit-NN-<date>` were renamed on 2026-10-14 by a documentation-only migration; [report-names](report-names/README.md) holds its script and the record of every rename, edited file and rebound document hash. A historical validator's `--historical` mode compares a record with its retained snapshot and evidence ([retained_evidence.py](retained_evidence.py)) once the working tree has moved on.

## Publication privacy

Published machine-owner paths use `/home/user/...`; report time zone is explicitly UTC (+00:00). Historical records retain their original instants and date precision. Privacy-only metadata does not rerun checks or change findings, counts, source or artifact hashes. Each paired record retains its pre-edit document hashes and original document bindings as provenance; updated document bindings identify publication bytes only. Raw local evidence remains unchanged. See the [privacy metadata harness](AUD-030-harnesses/privacy-README.md) for the repeatable rebind-only step after document formatting.
