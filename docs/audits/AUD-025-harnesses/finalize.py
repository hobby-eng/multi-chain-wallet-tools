"""Build and validate the source-bound AUD-025 report from retained evidence."""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

import jsonschema

# Procedure files edited after this audit are checked through docs/audits/procedure_changes.py.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from procedure_changes import matches_audited  # noqa: E402

ROOT = Path.cwd()
BASE = ROOT / "docs/audits"
EVIDENCE = BASE / "AUD-025-evidence"
STEM = "AUD-025-2026-10-08"


def report_text(text):
    # Deliberate copy: each historical audit emitter must remain independently runnable.
    parts = ROOT.resolve().parts
    owner = parts[2] if len(parts) > 2 and parts[1] == "home" else Path.home().name
    return re.sub(re.escape(owner), "user", text, flags=re.IGNORECASE)


def unique(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, f"duplicate JSON key: {key}"
        result[key] = value
    return result


def read(path):
    return json.loads(path.read_text(), object_pairs_hook=unique)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(record):
    jsonschema.Draft202012Validator(read(ROOT / "docs/audit-report.schema.json")).validate(record)
    markdown = (BASE / (STEM + ".md")).read_text()
    ids = {item["id"] for item in record["findings"] + record["observations"]}
    assert ids == set(re.findall(r"AUD-025-(?:SEC|FUN|API|BLD|DOC|UI|ARC)\d{3,}", markdown))
    assert len(record["checks"]) == len({item["id"] for item in record["checks"]}) == 32
    for path, expected in record["authorizedAdditions"]["sourceManifest"]:
        assert (not (ROOT / path).exists()) if expected == "deleted" else digest(ROOT / path) == expected
    for path, expected in record["procedureHashes"].items():
        assert matches_audited(ROOT.parent / path, expected), path
    for path, expected in record["harnessHashes"].items():
        assert digest(ROOT / path) == expected, path
    for path, expected in record["externalHarnessHashes"].items():
        assert digest(ROOT.parent / path) == expected, path
    for item in record["commands"]:
        assert digest(EVIDENCE / (item["label"] + ".log")) == item["logSha256"]
    for target in re.findall(r"\]\(([^)]+)\)", markdown):
        if not target.startswith(("http:", "https:", "#")):
            assert (BASE / target.split("#")[0]).exists(), target
    assert subprocess.run(["git", "check-ignore", str(EVIDENCE / "initial.json")], capture_output=True).returncode == 0
    assert "AUD-025-evidence/" not in subprocess.check_output(["git", "diff", "--cached", "--name-only"], text=True)
    result = {
        "schema": "passed", "uniqueKeys": True, "pairedRecordIds": True,
        "checkCount": 32, "links": "passed", "sourceProcedureHarnessLogHashes": "passed",
        "authorizedChangedFiles": record["authorizedAdditions"]["changedFiles"],
        "evidenceIgnoredAndNotStaged": True,
    }
    (EVIDENCE / "report-validation.json").write_text(json.dumps(result, indent=2) + "\n")
    files = sorted(path for path in EVIDENCE.rglob("*") if path.is_file() and path.name != "SHA256SUMS")
    (EVIDENCE / "SHA256SUMS").write_text("".join(f"{digest(path)}  {path.relative_to(EVIDENCE)}\n" for path in files))
    print(json.dumps(result, indent=2))


if sys.argv[1:] == ["--validate-only"]:
    validate(read(BASE / (STEM + ".json")))
    raise SystemExit(0)
assert not sys.argv[1:], "Only --validate-only is accepted."

initial = read(EVIDENCE / "initial.json")
final = read(EVIDENCE / "final.json")
before, after = dict(initial["records"]), dict(final["records"])
changed = sorted(path for path in before.keys() | after.keys() if before.get(path) != after.get(path))
assert changed == sorted([
    "packages/crypto-core/src/bip39-chosen-words.ts",
    "packages/crypto-core/tests/bip39-chosen-words-boundaries.test.ts",
    "packages/crypto-core/tests/bip39-chosen-words-randomness.test.ts",
    "packages/verification/src/bip39-self-test.ts",
    "packages/verification/tests/bip39-self-test.test.ts",
]), changed
commands = []
for path in EVIDENCE.glob("*.command.json"):
    commands.append({"label": path.name.removesuffix(".command.json"), **read(path)})
commands.sort(key=lambda item: item["startedAt"])

checked = {
    "CHECK-SEC-001": ("passed", "Scoped public-fixture entropy and chosen-word ownership trace; no broad vault assessment."),
    "CHECK-SEC-002": ("passed", "Filtered file-browser cases retain offline/CSP assertions; no complete sandbox review."),
    "CHECK-SEC-003": ("passed", "Scoped browser cases assert no HTTP or persistence; connected providers not exercised."),
    "CHECK-SEC-004": ("passed", "Exact bit/filter mapping and fixed-seed distribution controls; no host CSPRNG certification."),
    "CHECK-SEC-005": ("passed", "Batch wiping/exception tests and checked-generation cancel/refusal paths; inherited MHFE observations are separate."),
    "CHECK-SEC-007": ("passed", "Serialized bounded execution, sampled 3GiB RSS guard, 2GiB available reserve, no full cards."),
    "CHECK-FUN-001": ("passed", "All five entropy/checksum geometries, exhaustive public mapping, independent checksum oracle and poisoned valid phrases."),
    "CHECK-API-001": ("passed", "Actual TS public generation API and vendored MHFE browser-class integration, not placeholder clients."),
    "CHECK-API-002": ("passed", "Scoped UI gates, already-aborted TS and MHFE cancellation; inherited library gate overlap not claimed as reachable UI bypass."),
    "CHECK-API-004": ("passed", "Scoped word normalization, invalid inputs, exact full mnemonic/checksum interoperability."),
    "CHECK-BLD-001": ("passed", "Feature-owned startup checks; targeted HTML composition of both existing editions without WASM regeneration."),
    "CHECK-BLD-002": ("passed", "Filtered Chromium/Firefox checks in both editions, not the entire feature/build matrix."),
    "CHECK-BLD-003": ("passed", "File integrity pins pass; existing provenance gate warns about local uncommitted vendors and unavailable public commits. No signed-release acceptance."),
    "CHECK-UI-001": ("passed", "Focused real file-page behavior in two browsers and editions; no whole-app responsive/accessibility claim."),
    "CHECK-UI-002": ("passed", "Chosen/MHFE checked inputs, refusals, cancel and startup failure closure; unrelated tabs excluded."),
    "CHECK-ARC-001": ("passed", "Feature rules remain host-neutral; page delegates sampling, no algorithm edits or class refactor."),
    "CHECK-ARC-002": ("passed", "Independent verification geometry is deliberately pinned, not another production source of truth; no repository-wide zero-copy assertion."),
    "CHECK-ARC-003": ("passed", "Baseline blind spots addressed with all-index oracles, position/joint statistics and real failure controls."),
    "CHECK-DOC-001": ("passed", "Approximate bit estimates and known-word/MHFE warnings traced; checksum does not establish randomness."),
    "CHECK-DOC-002": ("failed", "pnpm check retains AUD-024's broken relative link to deleted mhfe-wallet-check.ts. Direct source typecheck passes; historical report not rewritten."),
    "CHECK-DOC-003": ("passed", "Paired record/schema/32-check ledger, exact source and command hashes, resolved new links, ignored evidence."),
}
guide = (ROOT / "docs/FULL_AUDIT_GUIDE.md").read_text()
checks = []
for check, title in re.findall(r"^### (CHECK-[A-Z]+-\d+) \u2014 (.+)$", guide, re.M):
    outcome, reason = checked.get(check, ("not-run", "Existing subsystem outside this chosen-word audit; not reaccepted by these checks."))
    checks.append({"id": check, "title": title, "outcome": outcome, "evidenceOrGap": reason})
assert len(checks) == 32

observation = {
    "id": "AUD-025-SEC001", "category": "SEC", "kind": "observation",
    "title": "Vendored MHFE retains the separately recorded overlapping self-check API risk",
    "severity": "medium", "status": "duplicate", "releaseBlocking": False,
    "duplicateOf": "mhfe/AUD-014-SEC001",
    "reproduction": "Inspect the exact 2a1caf4b runtime PackageCheck.require against MHFE AUD-014: sticky failure is checked before, but not after, awaiting startup. The MHFE report retains public API witnesses.",
    "expected": "The MHFE package promises that a failed check permanently closes subsequent and pending operations.",
    "observed": "The vendor contains the same pre-await-only gate. Normal Deriver panel jobs are serialized; Generate & Derive checked mode has a separate engine, and global failure disables/cancels generation and publication. No normal Deriver UI overlap bypass was demonstrated.",
    "impact": "Inherited library API concern, not a new bit-slicing/sampling defect or demonstrated Deriver UI key-generation bypass. Its primary severity and release decision remain in the MHFE report; this targeted Deriver audit does not certify the whole release.",
    "evidence": ["packages/recovery-mhfe-wasm/generated/runtime/runtime.js:737-741", "review of RecoveryJobGate, MhfeTask, CheckedMnemonicFeature and controller failure/publication gates", "mhfe/docs/audits/AUD-014-2026-10-08.md"],
    "recommendedFix": "Resolve MHFE AUD-014-SEC001 in its authoritative source, then explicitly sync the rebuilt vendor and rerun package/UI gates. No vendor sync was authorized or performed here.",
    "requiredVerification": "Primary MHFE public API race regressions and the Deriver's relevant checked-generation/startup failure cases must pass on the exact synced bytes.",
}
model_observation = {
    "id": "AUD-025-ARC001", "category": "ARC", "kind": "observation",
    "title": "Excluded-word bit expectation corrected in the statistical tests",
    "severity": "info", "status": "verified", "releaseBlocking": False,
    "reproduction": "Under the ideal uniform-word model, exclude zoo (index 2047, all eleven bits set) and enumerate the 2047 remaining indices: each bit has 1023 ones.",
    "expected": "The per-bit null is 1023/2047, not 0.5; joint and grouped-bin nulls likewise count the actual allowed indices.",
    "observed": "Baseline c312d494 test assumed 0.5. Authorized additions derive the allowed-list null and enumeration reproduces 0.49975574010747437 for every bit. All 47 scoped tests pass.",
    "impact": "Confirmed small test-model error, not a production generator defect. At 20,000 phrases the shift is about 0.069 standard deviations, with no practical baseline false-positive or false-negative demonstrated. SHA/checksum modeling remains idealized.",
    "evidence": ["statistical-models", "all-scoped-tests", "packages/crypto-core/tests/bip39-chosen-words-randomness.test.ts bitProbability and assertCorrelations"],
    "recommendedFix": "Completed in the authorized test-only change; retain enumerated null controls without claiming exact entropy or suite-wide significance.",
    "requiredVerification": "The allowed-index enumeration, five-length production datasets and checksum-valid poison controls pass on the bound source.",
}
tree_memory = []
for item in commands:
    for line in (EVIDENCE / (item["label"] + ".log")).read_text(errors="replace").splitlines():
        if line.startswith('{"ownedTreeMemory":'):
            tree_memory.append({"label": item["label"], **json.loads(line)["ownedTreeMemory"]})
record = {
    "schemaVersion": 1, "auditId": "AUD-025", "auditNumber": 25, "date": "2026-10-08",
    "title": "Deriver chosen-word bit boundaries, constrained sampling and startup checks",
    "reviewer": {"name": "Codex coordinator and three scoped reviewers", "model": None, "reasoningEffort": None},
    "requestedReviewerSettings": {"model": "GPT 6.1", "reasoningEffort": "ultra"},
    "reviewerPhases": [{"scope": scope, "model": "gpt-6.1-sol", "reasoningEffort": "ultra", "source": "explicit spawn configuration, retained when reused"} for scope in ["bit geometry and independent skeptic", "test statistics and failure controls", "startup gates and browser integration"]],
    "snapshot": {"commit": initial["head"], "commitComplete": False, "workingTree": "Pre-existing dirty modular refactor retained; baseline captured before separately authorized test/startup additions.", "sourceFingerprint": initial["sourceFingerprint"]},
    "authorizedAdditions": {"sourceFingerprint": final["sourceFingerprint"], "changedFiles": changed, "sourceManifest": final["records"], "productionAlgorithmChanged": False},
    "procedureHashes": initial["procedureHashes"],
    "harnessHashes": {str(path.relative_to(ROOT)): digest(path) for path in sorted((BASE / "AUD-025-harnesses").rglob("*")) if path.is_file()},
    "externalHarnessHashes": {"mhfe/docs/audits/AUD-014-harnesses/run.py": digest(ROOT.parent / "mhfe/docs/audits/AUD-014-harnesses/run.py")},
    "artifacts": {"before": read(EVIDENCE / "before-artifacts.json"), "after": read(EVIDENCE / "after-artifacts.json"), "relationship": "Only targeted Deriver HTML rebuilt. Vendor remains 2a1caf4b; new MHFE 112ca5a0 checks are not synced. Stale general verification record is not acceptance of these bytes."},
    "scope": "Targeted security-sensitive audit of chosen/excluded BIP39 words: all five TS lengths, byte/word boundaries, final entropy/checksum splits, predicate sampling, test quality and startup/full-component checks. Checked 24-word generation delegates to the existing MHFE package, audited separately first as MHFE AUD-014. This is not a fresh full audit of other coins, recovery systems or the modular refactor.",
    "checks": checks, "commands": commands, "findings": [], "observations": [observation, model_observation],
    "remediation": [
        {"id": observation["id"], "status": "duplicate", "fixCommit": None, "verificationCommit": None, "evidence": "Primary open MHFE finding, no runtime fix or vendor sync here."},
        {"id": model_observation["id"], "status": "verified", "fixCommit": None, "verificationCommit": None, "evidence": "Authorized dirty test bytes, enumeration and 47-test scoped run."},
    ],
    "memory": {"peakSampledProcessGroupRssBytes": max(item["memory"]["peakRssBytes"] for item in commands), "peakLaterSampledDescendantRssBytes": max(item["peakRssBytes"] for item in tree_memory), "minimumAvailableBytes": min(item["memory"]["minimumAvailableBytes"] for item in commands), "rssBudgetBytes": 3221225472, "availableReserveBytes": 2147483648, "descendantReports": tree_memory},
    "resultCounts": {"scopedUnitTests": 47, "unitFiles": 4, "publicApiSuccessfulBoundaryComparisons": 717822, "preRngPositionRefusals": 35, "productionStatisticalDatasets": 17, "productionStatisticalPhrases": 149152, "syntheticChecksumValidControlPhrases": 360000, "startupImplementationMutantsRejected": 6, "startupBrowserProfileCases": 4, "filteredBrowserScenarioCases": 8, "wholeStartupMilliseconds": [493, 450, 582, 486]},
    "retainedNonzeroCommands": {"artifacts-before": "Harness assumed intentionally unvendored launcher existed; corrected owner-based inventory passes.", "startup-mutants": "Harness used an unavailable TS7 compiler API; corrected existing Prettier structured AST parser passes.", "typecheck": "New test inferred a too-narrow typed-array buffer type; explicit annotation and direct typecheck pass.", "project-check": "Historical AUD-024 link failure; not changed.", "memory-tree-leftover": "Expected exit75 for the deliberately outliving synthetic child; captured child terminated."},
    "testImprovements": [
        "Whole-integer/Node-SHA public API oracle: 696,320 nonfinal cases, 20,480 final-index acceptance/refusal cases and 992 suffix preimages; all five lengths, exact full phrase and neighbors compared.",
        "Startup: 2,340 writer comparisons plus 2,340 reader comparisons from separate oracle fixtures; 90 positions, 13 patterns, two backgrounds, five independently pinned checksum answers and true/false predicate/plan controls.",
        "Existing exact 24-word startup phrase retained; real checksum faults, complete wrong phrases and in-memory implementation mutants challenge refusal rather than round trips alone.",
        "Statistical coverage expanded: 17 production datasets containing 149,152 phrases across all five lengths, plus 360,000 synthetic checksum-valid controls. Per-position, selected bit-joint/correlation, exclusion and anywhere multiplicity models added.",
    ],
    "limitations": [
        "No newly confirmed mapping/sampling defect; passing tests do not prove absence of arbitrary defects, RNG entropy or host-compromise resistance.",
        "Statistical fixtures use finite fixed-seed samples and ideal SHA/checksum modeling. Wilson-Hilferty chi-square bounds are explicitly approximate, per comparison, not exact multinomial or suite-wide failure rates.",
        "Independent application oracles still trust the pinned English wordlist and cryptographic primitives after public KAT checks; no new cryptographic primitive certification.",
        "Full card generation, full browser self-test button, full-cost Argon2/vectors, complete test matrix, Docker reproducibility and release acceptance were not executed.",
        "Full project check fails on the historical AUD-024 missing link; those audit bytes are not silently rewritten. Direct source typechecking passes.",
        "Original artifact harness assumed the deliberately unvendored native launcher was present; its failure and corrected owner-based inventory probe are both retained, not counted as an application defect.",
        "Original TS7 parser harness error and new typed-array test annotation failure are retained separately; corrected checks pass and are not baseline application findings.",
        "Early process-group sampling excludes detached children; later descendant monitoring addresses that gap but still samples, can miss immediately reparented/short-lived processes, omits swaps/cache and may count shared pages twice. Neither is a hard allocation cap or earlier-freeze diagnosis.",
        "The audit memory helper stops sampling during its bounded exit cleanup, lacks external-termination cleanup, and requires Linux procfs/Python pidfd support. Its synthetic probes exercise basic ownership/exit behavior, not every resource-failure path; no safety termination occurred in application tests.",
        "Existing provenance verification queried public GitHub commit availability; two queries returned HTTP 422 and local uncommitted vendors remain explicitly warned. No secret values were transmitted, no application network behavior was added, and no signed-release provenance claim is made.",
        "The report completion date and timestamps use UTC.",
        "Coordinator model/effort telemetry unavailable; requested GPT6.1 ultra and three explicitly configured gpt-6.1-sol ultra reviewers are distinguished. No commit, push, vendor sync or other checkout was created.",
    ],
}
record = json.loads(report_text(json.dumps(record)))
jsonschema.Draft202012Validator(read(ROOT / "docs/audit-report.schema.json")).validate(record)
(BASE / (STEM + ".json")).write_text(json.dumps(record, indent=2) + "\n")
lines = [f"# AUD-025 - {record['title']}", "", "## Record metadata", "",
         "- **Audit number:** 25; completed UTC 2026-10-08.",
         "- **Reviewer:** Codex coordinator and three independent scoped reviewers.",
         "- **Model / reasoning:** requested GPT 6.1 / ultra; actual coordinator telemetry unknown. All three scoped reviewers explicitly configured `gpt-6.1-sol`, `ultra`.",
         f"- **Reviewed commit:** `{initial['head']}` plus dirty working tree ({len(initial['records'])} source paths).",
         f"- **Baseline fingerprint:** `{initial['sourceFingerprint']}`.",
         f"- **After authorized additions:** `{final['sourceFingerprint']}`; five files, generator/search/predicate/RNG algorithms unchanged.",
         "- **Artifacts:** targeted HTML builds only; exact before/after hashes in the [JSON companion](" + STEM + ".json). Vendored MHFE stays `2a1caf4bda4e634c`.",
         "", "## Finding register", "", "No new generator correctness finding was confirmed. The inherited library concern is recorded separately:", "",
         "| ID | Category | Kind | Severity | Status | Title |", "| --- | --- | --- | --- | --- | --- |",
         f"| {observation['id']} | SEC | observation | medium | duplicate | {observation['title']} |",
         f"| {model_observation['id']} | ARC | observation | info | verified | {model_observation['title']} |",
         "", "## Review evidence", "", "### Scope and methodology", "", record["scope"], "",
         "An unchanged baseline was captured after the initial 14 tests. Necessary unit and startup additions were separately authorized. Checks ran serially with a sampled 3GiB process-group budget and 2GiB available reserve; no full-card work ran. New startup oracles are intentionally independent of production geometry and compare exact results, not merely valid checksums.", "",
         "Procedure SHA256:", ""]
lines += [f"- `{path}`: `{sha}`." for path, sha in record["procedureHashes"].items()]
lines += ["", "### Coverage ledger", "", "| Check ID | Scope | Outcome | Evidence / gap |", "| --- | --- | --- | --- |"]
lines += [f"| {item['id']} | {item['title']} | {item['outcome']} | {item['evidenceOrGap']} |" for item in checks]
lines += ["", "### Checks", "", "Exact argv, UTC start/end, exit, log SHA256 and sampled memory are retained in the JSON companion. Logs, screenshots and detailed command records are **local-only**, ignored `AUD-025-evidence/`; overlapping suite totals are not added together.", "",
          "| Label / exact command | Exit | Log SHA256 |", "| --- | --- | --- |"]
for item in commands:
    command = " ".join(item["command"]).replace("|", "\\|")
    lines.append(f"| `{item['label']}`: `{command}` | {item['exitCode']} | `{item['logSha256']}` |")
lines += ["", "Final scoped run: **47 tests in 4 files pass** (167.21 s; overlapping earlier totals not added). Exact oracle: **717,822 successful public API comparisons**, with **35** separate pre-RNG refusals. Statistics: **149,152 production phrases in 17 datasets** plus **360,000 checksum-valid synthetic controls**. The six implementation mutants are all refused; four real-browser startup/profile cases and eight filtered scenario/profile/browser cases pass. Entire healthy startup took **450-582 ms**, including other built-in quick components, not just chosen-word checks.", "",
          "Nonzero command interpretations:", ""]
lines += [f"- `{label}`: {reason}" for label, reason in record["retainedNonzeroCommands"].items()]
lines += ["", f"Later descendant sampling peaked at **{record['memory']['peakLaterSampledDescendantRssBytes']} bytes**; available-memory sampling stayed at or above **{record['memory']['minimumAvailableBytes']} bytes**. Earlier process-group numbers do not include detached Vitest children and are not complete workload peaks."]
lines += ["", "### Findings", "", "No new entropy-bit placement, checksum split, neighbor clobber or rejection-sampling defect was reproduced. The public mapping oracles and poison controls support only their stated scope.", "",
          "### Remediation and follow-up", "", "No production generator/runtime fix was made. Authorized additions:", ""]
lines += ["- " + item for item in record["testImprovements"]]
lines += ["", "### Informational observations and recommendations", "", f"#### {observation['id']} - Inherited MHFE API issue", ""]
for key, label in [("category", "Category"), ("severity", "Severity"), ("status", "Status"), ("releaseBlocking", "Release blocking for this demonstrated Deriver scope"), ("reproduction", "Reproduction"), ("expected", "Expected"), ("observed", "Observed"), ("impact", "Impact"), ("recommendedFix", "Recommended fix"), ("requiredVerification", "Required verification")]:
    lines.append(f"- **{label}:** {observation[key]}")
lines += ["", "See the primary [MHFE AUD-014 report](../../../mhfe/docs/audits/AUD-014-2026-10-08.md). Its open first-party secret-copy finding is also inherited by the old vendor; no new memory-disclosure path was established here.", "",
          f"#### {model_observation['id']} - Corrected test model", ""]
for key, label in [("severity", "Severity"), ("status", "Status"), ("reproduction", "Reproduction"), ("expected", "Expected"), ("observed", "Observed"), ("impact", "Impact"), ("evidence", "Evidence"), ("recommendedFix", "Correction"), ("requiredVerification", "Verification")]:
    lines.append(f"- **{label}:** {model_observation[key]}")
lines += ["",
          "### Assessment and limitations", "", "The existing bit manipulation is consistent with BIP39 at all five lengths. Startup checks now cover all positions and deliberate refusals while retaining the independent exact phrase KAT. A valid checksum alone cannot detect biased or repeated entropy: the additional poisoned datasets deliberately remain checksum-valid. This report does not authorize release or certify the unrelated modular refactor.", ""]
lines += ["- " + item for item in record["limitations"]]
(BASE / (STEM + ".md")).write_text(report_text("\n".join(lines) + "\n"))
validate(record)
