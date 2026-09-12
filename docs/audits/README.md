# Audit records

Audit numbers preserve chronological order. The five current review records remain in this directory; older records are retained under `archive/` so findings and remediation evidence are not lost.

## Current sequence

1. [02 — remediation audit](2026-09-12-02-remediation-audit.md)
2. [03 — follow-up audit](2026-09-12-03-followup-audit.md)
3. [04 — independent audit](2026-09-12-04-independent-audit.md)
4. [05 — remediation verification](2026-09-12-05-remediation-verification.md)
5. [06 — independent re-verification](2026-09-12-06-independent-reverification.md)

The machine-readable JSON twin beside each applicable report belongs to the same point-in-time review.

## Foundational and archived records

- [2026-09-08 immutable baseline metadata](2026-09-08-baseline.json) remains at this path because repository metadata tests address it directly.
- [2026-09-08 remediation](archive/2026-09-08-remediation.md)
- [2026-09-09 remediation](archive/2026-09-09-remediation.md)
- [01 — initial independent audit](archive/2026-09-12-01-initial-audit.md)

Historical findings are not current acceptance evidence. Use the latest report and the `dist/verification-record.json` emitted for the build being evaluated.
