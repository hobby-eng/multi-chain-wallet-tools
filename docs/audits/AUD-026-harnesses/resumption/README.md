# AUD-026 resumption verification

This bounded continuation verifies that the AUD-026 corrections and local HTML survived a host hang. It belongs to the resumption phase in [AUD-026](../../AUD-026-2026-10-09.md), at the exact source fingerprint in its JSON companion. It does not rerun browser, vector, PDF, Docker or wallet runtime tests.

Run from the repository root with Python 3 and `jsonschema`:

```sh
python3 -B docs/audits/AUD-026-harnesses/resumption/verify.py
```

Inputs are the paired reports, installed audit harnesses, the retained original evidence in the ignored `docs/audits/AUD-026-evidence/`, the current source manifest and the twelve ignored HTML files. No real wallet data or network is needed. The script checks exact correction-owner and artifact bytes, every retained remediation command/log, the new append-only report phase and all supporting-path differences recorded after the hang. An unexpected byte change exits non-zero. A successful output has `savedCorrections: passed` and exits 0.

The older exact-prefix validators now reject later edits to historical report metadata. Their failures are retained and reported separately; a successful saved-byte comparison does not change them to passes. The baseline finding-register validator passes. The original 22 verified and 10 fixed dispositions, with their runtime/release gaps, are unchanged. This continuation neither accepts a release nor claims that the original full source snapshot still matches the live checkout.
