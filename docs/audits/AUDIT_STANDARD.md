# Audit report standard

This standard applies to new audits and follow-up records. Reports and structured records are written in English. Historical reports were normalized in a documentation-only migration on 2026-09-18. Their canonical IDs follow this standard; original aliases are retained in [LEGACY_FINDING_IDS.md](LEGACY_FINDING_IDS.md), its JSON twin, and `legacyId` metadata. Existing report filenames and dates remain unchanged. Do not infer a historical finding's severity from its former prefix.

The execution procedure and coverage requirements are defined in [FULL_AUDIT_GUIDE.md](../FULL_AUDIT_GUIDE.md). Its `CHECK-SEC-001` task IDs are checklist references, distinct from report finding IDs. Group findings by category and subsystem; retain IDs when reordering.

## Report numbering

Use one repository-wide sequence, independent of tool, reviewer, model, severity, or date. Assign the next unused number after the highest existing audit number; never reuse an assigned number or renumber published reports. Coordinate reservations when reviews run concurrently.

The report identifier is `AUD-018` for audit 18. Use at least three digits in report identifiers, expanding when needed. Filenames keep the existing convention: `audit-18-2026-09-18.md` and `audit-18-2026-09-18.json`, with at least two digits for the audit number. The date is the UTC completion date. The Markdown and JSON pair describes the same review and must agree on metadata, finding IDs, severities, statuses, and results. Add each new report to the chronological index in README.md.

A fresh review of a different snapshot receives a new audit number. Updating remediation evidence in an existing report does not change its number, original review date, or reviewed snapshot; record the update date and verification commit separately.

## Finding identifiers

Every finding uses an immutable identifier with a category, such as `AUD-018-DOC001`, `AUD-018-SEC001`, or `AUD-018-API001`. Number findings independently within each category in their initial presentation order, using at least three digits. Do not encode severity, tool, remediation status, or priority in the ID. Do not reuse deleted or withdrawn IDs or renumber findings after publication. Use the same full ID in headings, summaries, JSON, fix tables, tests, and follow-up references.

Use a heading such as:

```text
### AUD-018-API001 — Medium — Invalid runtime format is accepted
```

### Finding categories

| Code  | Category                     | Examples                                                                                               |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SEC` | Security                     | Secret leakage, broken isolation, unsafe randomness, incorrect security guarantees.                    |
| `FUN` | Functional correctness       | Wrong address, key, transaction interpretation, or reconstructed secret.                               |
| `API` | API and data contracts       | Invalid arguments accepted, dependency integration mismatch, incorrect serialization or export fields. |
| `BLD` | Build and release            | Feature composition, CI, reproducibility, integrity gates, packaging.                                  |
| `DOC` | Documentation                | Incorrect README, missing instructions, stale version or dependency descriptions.                      |
| `UI`  | User interface               | Layout, visibility, navigation, interaction, misleading control behavior.                              |
| `ARC` | Architecture and maintenance | Dead code, duplicate logic, module boundaries, unnecessary exports.                                    |

Choose one primary category according to the defect's root cause; use optional `tags` for secondary areas and affected tools. A misleading statement caused by incorrect runtime signature analysis is `FUN` (or `SEC` if the finding establishes a broken security guarantee), not `DOC` merely because the UI displays text. Incorrect written guidance is `DOC`; an incorrect exported CSV field is `API`; a clipped export button is `UI`.

JSON findings include `category` with one of the exact uppercase codes above, matching their ID. If the category is later reassessed, preserve the published ID and original category; record the revised classification and explanation separately. Do not assign a second ID to the same defect simply because it affects multiple areas.

A fix or verification row retains the finding's ID; it does not introduce an `R01`, `A01`, or new severity-prefixed ID. Recommendations that address a finding use its ID. General architecture advice, coverage gaps, and informational observations belong in separate sections without finding IDs unless they describe a concrete tracked defect.

A later review of an existing finding references its original ID. If an independent new finding is related to an earlier one, give the new finding its own ID and record `relatedFindings`. A duplicate retains its assigned ID, has status `duplicate`, and references the original finding in `duplicateOf`.

## Severity and priority

Severity is a separate field, with one of these lowercase JSON values. Markdown uses the corresponding capitalized label.

| Severity   | Meaning                                                                                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `critical` | Demonstrated direct compromise of secrets or unauthorized spending with broad or immediately exploitable impact.                                                                          |
| `high`     | A reproducible defect with serious security impact or a release-blocking failure of a mandatory integrity, isolation, or recovery guarantee. State the concrete impact and prerequisites. |
| `medium`   | A reproducible correctness, compatibility, API-contract, or build-composition defect affecting supported behavior without demonstrated direct secret compromise.                          |
| `low`      | A limited presentation, documentation, maintainability, or export defect with bounded practical impact.                                                                                   |
| `info`     | An observation with no demonstrated defect or actionable risk; normally place it outside the findings list.                                                                               |

Severity reflects evidence and impact, not a naming prefix or an unsupported worst-case assumption. A reproducibility failure is not proof of key theft. Record exploitability, affected scope, and limitations explicitly. If severity changes, retain the ID and record the previous value, reason, and update date.

Do not use `P1/P2/P3` or `H-01/M-01/L-01` as substitutes for finding identifiers or severity. If scheduling priorities are needed, use a separate optional `priority` field: `urgent`, `normal`, or `deferred`. Record release blocking independently as a boolean `releaseBlocking` with a reason.

## Remediation status

| JSON status      | Meaning                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `open`           | Confirmed finding with no completed fix.                                                                                                                          |
| `fixed`          | A fix exists at the recorded commit, but the required verification has not yet passed or has not been performed.                                                  |
| `verified`       | The recorded fix passed the stated regression and acceptance checks at the recorded verification commit. This does not imply that every possible case was tested. |
| `deferred`       | Confirmed finding intentionally postponed; record the reason and remaining risk.                                                                                  |
| `accepted`       | The repository owner explicitly accepted the remaining risk; record the decision evidence. A reviewer must not infer acceptance.                                  |
| `not-reproduced` | A previous allegation could not be reproduced within the stated scope; record attempts and limitations rather than claiming it impossible.                        |
| `withdrawn`      | Evidence showed the reported finding was incorrect; retain the original ID and explain the correction.                                                            |
| `duplicate`      | The same defect is tracked under another ID; specify `duplicateOf`.                                                                                               |

Remediation and verification tables use `Finding ID`, `Status`, `Fix commit`, `Verification commit`, and `Evidence` columns. Do not silently rewrite historical findings as though the reviewed snapshot had already contained the fix.

## Required report content

1. Report ID, UTC completion date, full reviewed commit, working-tree state, and artifact/source fingerprints where applicable.
2. Reviewer name or kind, exact model identifier, and reasoning effort actually used. Unknown values remain null in JSON and explicitly unknown in Markdown; never guess them retrospectively.
3. Scope, excluded areas, upstream references and pinned revisions, environment, tool/browser versions, and methodology.
4. Checks with actual commands, outcomes, counts, and evidence. Distinguish passed, failed, skipped, and not run; compilation alone does not prove runtime behavior. Do not claim results from another snapshot as newly performed checks.
5. Each finding: ID, title, severity, status, affected files/builds, reproduction, expected and observed behavior, impact and prerequisites, supporting evidence, recommended fix, and verification requirements. Unsupported claims remain hypotheses, not confirmed findings.
6. Remediation evidence, remaining limitations, and an assessment that distinguishes tested coverage from a security certification.

Use [AUDIT_TEMPLATE.md](AUDIT_TEMPLATE.md) for new Markdown reports. The template is not a completed audit and must not receive an audit number in the index. JSON reports use `schemaVersion: 1`, `auditId`, `auditNumber`, `date`, `reviewer`, `snapshot`, `scope`, `checks`, `findings`, `observations`, `remediation`, and `limitations`; additional evidence fields are allowed. Each finding must have `id`, `category`, `title`, `severity`, `status`, `releaseBlocking`, and the substantive fields described above. All retained historical records now have this shared envelope. Original fields that do not fit the envelope are retained under `historicalEvidence`; executed checks remain under `checks`. Existing finding details are retained, not replaced with a fresh audit assessment. The [JSON schema](audit-report.schema.json) describes the shared envelope.

Before publishing, verify that all report text is English, IDs are unique, paired records agree, evidence links resolve where retained, and dates, commit hashes, check counts, and reviewer metadata are accurate. Report documentation edits as documentation edits, not a new audit execution.

## Historical normalization

The migration adds a Markdown/JSON pair for every numbered report, including companions reconstructed from retained material where only one format existed. Such companions explicitly state their origin; they are not newly executed audits. A common `Record metadata`, `Finding register`, and `Review evidence` presentation surrounds the original review, reproduction, checks, and limitations. Original review sections remain because restructuring must not discard technical evidence.

`findings` contains defects, `observations` contains informational or conformance records, and `remediation` contains dispositions referencing original finding IDs from earlier reports. Informational records that already had IDs retain canonical IDs with `kind: "observation"`; they are not newly classified defects. New untracked informational observations normally need no IDs.

Historical `severity`, `status`, `releaseBlocking`, snapshot, or detailed reproduction fields can be null when the retained evidence does not establish them. Null means **not recorded**, never passed, harmless, accepted, or resolved. P1/P2/P3 historical scheduling priorities are retained as `legacyPriority`; they are not automatically converted to severity. A mitigation remains open unless the recorded evidence supports closure. Status refers to that historical report and its explicit addenda; a later follow-up records its own disposition without silently changing the earlier snapshot.

Original hashes, upstream pins, environment versions, counts, failed checks, skipped checks, reviewer metadata, and reproduction values must remain unchanged. Migration notes distinguish documentation edits from new verification work. Old heading anchors are retained as compatibility aliases where finding headings change.
