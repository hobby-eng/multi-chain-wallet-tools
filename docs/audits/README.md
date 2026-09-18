# Audit records

Audit files use one global chronological sequence. Markdown and JSON files with the same number belong to the same review. New reports record the reviewer model and reasoning-effort level. Historical reports retain only metadata that was actually recorded; an unknown model or effort is marked as unknown rather than inferred.

New audits must follow [the audit report standard](AUDIT_STANDARD.md) and [the report template](AUDIT_TEMPLATE.md). Finding IDs include a category, for example `AUD-018-DOC001` or `AUD-018-SEC001`; severity and remediation status are separate fields. Historical labels have been migrated; use [the alias mapping](LEGACY_FINDING_IDS.md) to resolve older references. Every numbered report has Markdown and JSON companions. The 2026-09-18 normalization changes presentation and identifiers, not the original audit execution or results.

1. [AUD-001](audit-01-2026-09-08.md) · [JSON](audit-01-2026-09-08.json) — 2026-09-08
2. [AUD-002](audit-02-2026-09-08.md) · [JSON](audit-02-2026-09-08.json) — 2026-09-08
3. [AUD-003](audit-03-2026-09-09.md) · [JSON](audit-03-2026-09-09.json) — 2026-09-09
4. [AUD-004](audit-04-2026-09-12.md) · [JSON](audit-04-2026-09-12.json) — 2026-09-12
5. [AUD-005](audit-05-2026-09-12.md) · [JSON](audit-05-2026-09-12.json) — 2026-09-12
6. [AUD-006](audit-06-2026-09-12.md) · [JSON](audit-06-2026-09-12.json) — 2026-09-12
7. [AUD-007](audit-07-2026-09-12.md) · [JSON](audit-07-2026-09-12.json) — 2026-09-12
8. [AUD-008](audit-08-2026-09-12.md) · [JSON](audit-08-2026-09-12.json) — 2026-09-12
9. [AUD-009](audit-09-2026-09-12.md) · [JSON](audit-09-2026-09-12.json) — 2026-09-12
10. [AUD-010](audit-10-2026-09-15.md) · [JSON](audit-10-2026-09-15.json) — 2026-09-15
11. [AUD-011](audit-11-2026-09-15.md) · [JSON](audit-11-2026-09-15.json) — 2026-09-15
12. [AUD-012](audit-12-2026-09-17.md) · [JSON](audit-12-2026-09-17.json) — 2026-09-17
13. [AUD-013](audit-13-2026-09-17.md) · [JSON](audit-13-2026-09-17.json) — 2026-09-17
14. [AUD-014](audit-14-2026-09-17.md) · [JSON](audit-14-2026-09-17.json) — 2026-09-17
15. [AUD-015](audit-15-2026-09-17.md) · [JSON](audit-15-2026-09-17.json) — 2026-09-17
16. [AUD-016](audit-16-2026-09-17.md) · [JSON](audit-16-2026-09-17.json) — 2026-09-17
17. [AUD-017](audit-17-2026-09-17.md) · [JSON](audit-17-2026-09-17.json) — 2026-09-17

Historical findings describe only the reviewed snapshot. Use the latest audit and the `dist/verification-record.json` emitted for the build being evaluated.
