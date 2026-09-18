# AUD-NNN — Audit title

This is a template, not an executed audit. Replace placeholders and remove this sentence before publishing.

## Record metadata

- **Audit number:** N.
- **Completed (UTC):** YYYY-MM-DD.
- **Reviewer:** Name or review agent.
- **Model:** Exact identifier, or unknown.
- **Reasoning effort:** Actual setting, or unknown.
- **Reviewed commit:** Full commit hash.
- **Working tree:** Clean, or describe pre-existing changes and retained diff evidence.
- **Artifacts:** Fingerprints and source/build relationship, or not reviewed.

## Finding register

| Finding / record ID | Category | Kind    | Severity | Recorded status | Title                 |
| ------------------- | -------- | ------- | -------- | --------------- | --------------------- |
| AUD-NNN-API001      | API      | finding | medium   | open            | Concrete defect title |

## Review evidence

### Scope and methodology

Describe supported tools, coins, feature combinations, dependencies, upstream revisions, environment, methods, and exclusions. See [AUDIT_STANDARD.md](AUDIT_STANDARD.md) for the required conventions.

### Checks

| Check / command              | Outcome                             | Counts / environment | Evidence                    |
| ---------------------------- | ----------------------------------- | -------------------- | --------------------------- |
| Actual command or inspection | Passed / failed / skipped / not run | Actual values        | Retained evidence or reason |

### Findings

#### AUD-NNN-API001 — Medium — Concrete defect title

- **Category:** API.
- **Severity:** medium.
- **Status:** open.
- **Release blocking:** false; explain if true.
- **Affected files and builds:** Exact paths and relevant combinations.
- **Reproduction:** Inputs, steps, and prerequisites.
- **Expected behavior:** Supported contract or pinned upstream reference.
- **Observed behavior:** Actual reproducible result.
- **Impact:** Concrete consequences and limits of the evidence.
- **Evidence:** Test, vector, log, or retained probe.
- **Recommended fix:** Proposed correction.
- **Required verification:** Relevant regression and acceptance checks.

### Remediation and follow-up

| Finding ID     | Status | Fix commit | Verification commit | Evidence              |
| -------------- | ------ | ---------- | ------------------- | --------------------- |
| AUD-NNN-API001 | open   | Not fixed  | Not run             | Original reproduction |

Record follow-up dates separately; preserve the original reviewed snapshot and finding IDs.

### Informational observations and recommendations

Keep general advice separate from confirmed defects. Reference existing finding IDs where relevant.

### Assessment and limitations

Summarize what the recorded evidence demonstrates, what remains unresolved, and what was not tested. Do not imply independent certification or proof that all defects are absent.
