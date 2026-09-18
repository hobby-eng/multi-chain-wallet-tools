# Audit records

Audit files use one global chronological sequence. Markdown and JSON files with the same number belong to the same review. New reports record the reviewer model and reasoning-effort level. Historical reports retain only metadata that was actually recorded; an unknown model or effort is marked as unknown rather than inferred.

New audits must follow [the audit report standard](AUDIT_STANDARD.md) and [the report template](AUDIT_TEMPLATE.md). Finding IDs include a category, for example `AUD-018-DOC001` or `AUD-018-SEC001`; severity and remediation status are separate fields. Historical labels remain unchanged and must be cited with their audit number.

1. [Audit 01](audit-01-2026-09-08.json) — 2026-09-08
2. [Audit 02](audit-02-2026-09-08.md) — 2026-09-08
3. [Audit 03](audit-03-2026-09-09.md) — 2026-09-09
4. [Audit 04](audit-04-2026-09-12.md) — 2026-09-12
5. [Audit 05](audit-05-2026-09-12.md) — 2026-09-12
6. [Audit 06](audit-06-2026-09-12.md) — 2026-09-12
7. [Audit 07](audit-07-2026-09-12.md) — 2026-09-12
8. [Audit 08](audit-08-2026-09-12.md) — 2026-09-12
9. [Audit 09](audit-09-2026-09-12.md) — 2026-09-12
10. [Audit 10](audit-10-2026-09-15.md) — 2026-09-15
11. [Audit 11](audit-11-2026-09-15.md) — 2026-09-15
12. [Audit 12](audit-12-2026-09-17.md) — 2026-09-17
13. [Audit 13](audit-13-2026-09-17.md) — 2026-09-17
14. [Audit 14](audit-14-2026-09-17.md) — 2026-09-17
15. [Audit 15](audit-15-2026-09-17.md) — 2026-09-17
16. [Audit 16](audit-16-2026-09-17.md) — 2026-09-17
17. [Audit 17](audit-17-2026-09-17.md) — 2026-09-17

Historical findings describe only the reviewed snapshot. Use the latest audit and the `dist/verification-record.json` emitted for the build being evaluated.
