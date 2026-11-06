/** Writes the scoped CORE baseline from retained inventory and command evidence. */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const evidence = "docs/audits/AUD-033-evidence/";
const inventory = read(evidence + "inventory.json");
const snapshot = read(evidence + "snapshot.json");
const graph = read(evidence + "import-graph.json");
const procedureHashes = read(evidence + "procedure-hashes.json");
const guideHashes = read(evidence + "guide-hashes.json");
const environment = read(evidence + "environment.log");
const findings = [];
function finding(
  id,
  category,
  title,
  rules,
  affectedFiles,
  observed,
  impact,
  recommendedFix,
  requiredVerification,
) {
  findings.push({
    id: `AUD-033-${id}`,
    category,
    kind: "finding",
    title,
    severity: "low",
    status: "open",
    releaseBlocking: false,
    releaseBlockingReason:
      "Blocks an unqualified coding-guide compliance claim; no runtime compromise or release integrity failure is demonstrated by this finding alone.",
    rules,
    affectedFiles,
    reproduction:
      "Run the retained inventory and inspect the named source locations against the pinned coding guide.",
    expected: `Follow ${rules.join(", ")} within the guide's touched-code and gate-introduction applicability rules.`,
    observed,
    impact,
    evidence: ["local AUD-033-evidence/inventory.json", ...affectedFiles],
    recommendedFix,
    requiredVerification,
  });
}
finding(
  "BLD001",
  "BLD",
  "Required migration gates are absent from fast checks",
  ["CORE-43", "RUST-01", "RUST-02"],
  [
    "package.json",
    ".github/workflows/ci.yml",
    "tooling/test-rust.mjs",
    "packages/dash-shielded-wasm/rust/Cargo.toml",
    "packages/recovery-envelope-wasm/rust/Cargo.toml",
    "packages/recovery-codex32-wasm/rust/Cargo.toml",
    "apps/key-derivation/launcher/Cargo.toml",
  ],
  "pnpm check runs metadata, tsc and copies only. oxlint/oxlint-tsgolint and verify-code-rules are absent. Clippy/rustfmt are not wired for the five crates. Four crates lack the required lints table; the synced SSKR crate has it. The two cloud shell scripts do not start with set -euo pipefail; cloud-setup documents end-of-run error aggregation, which needs an explicit justified header exception rather than a blind -e addition.",
  "Legacy violations remain invisible to the current green fast gate.",
  "Introduce pinned type-aware lint and code-rules with negative controls; bring their actual scope green together. Add all-crate clippy/rustfmt and deliberate generated/data exclusions. Preserve the cloud script's intended error aggregation or redesign it coherently.",
  "Gate controls refuse intentional violations; all repository fast gates pass. Rust source changes require separately authorized canonical WASM regeneration.",
);
finding(
  "BLD002",
  "BLD",
  "Twenty-two action references differ from the approved pin table",
  ["CORE-10", "CI-01"],
  [
    ".github/workflows/ci.yml",
    ".github/workflows/audit.yml",
    ".github/workflows/launchers.yml",
    ".github/workflows/release.yml",
    ".github/workflows/vectors.yml",
  ],
  "The local shared action-pins checker exits 1 with 22 mismatches for setup-node, upload-artifact and download-artifact.",
  "Repository workflows have drifted from the workspace's single approved table; the references are still full hashes, so this does not demonstrate a mutable-tag vulnerability.",
  "Use the already approved table consistently in this repository, without dispatching Actions.",
  "Run node ../.github/scripts/verify-action-pins.mjs . and confirm zero differences.",
);
finding(
  "ARC001",
  "ARC",
  "Large controllers and files remain outside the size and module migration",
  ["CORE-01", "CORE-02", "CORE-03", "CORE-05", "CORE-15", "WEB-02"],
  [
    "apps/key-derivation/src/ui/controller.ts",
    "apps/key-derivation/src/ui/bip85-child-wallet-feature.ts",
    "apps/discovery-scanner/src/view.ts",
    "apps/activity-viewer/src/batch-controller.ts",
    "apps/key-derivation/src/ui/recovery-workspace-shared.ts",
    "tooling/verify-browser-regressions.mjs",
  ],
  "There are 17 physical files above 800 lines: 11 production, five tests, one tooling. No first-line size waiver is present. controller.ts is 1293 lines; createKeyDerivationController spans 1222 lines, its nested start spans 1214; Discovery view is 1143 lines and its factory spans 1023. There are 99 function spans above 150 (48 production, 45 test, six tooling), including nested wrappers and describe callbacks. These spans are candidates, not 99 independent oxlint failures. Five CSS files, two HTML templates and one consensus wordlist are included in the 17; data can require a named exclusion or justified exception rather than artificial splitting.",
  "State, event handling, rendering and feature composition remain coupled, making the remaining migration substantially larger than a few renames.",
  "Separate cohesive state/operation owners and keep thin installers. Split tests by behavior. Review long cohesive functions and data honestly; preserve template composition and consensus wordlist bytes.",
  "Pinned size/lint gates, targeted behavior and secret-lifecycle tests, affected edition/selective compilation, and corresponding browser regression cases.",
);
finding(
  "ARC002",
  "ARC",
  "Non-null assertions and compile-time private members remain",
  ["TS-03", "TS-05"],
  [
    "apps/discovery-scanner/src/view.ts",
    "packages/recovery-backup/src/slip39.ts",
    "apps/psbt-inspector/src/network-profile.ts",
    "apps/discovery-scanner/src/validated-exports.ts",
  ],
  "The AST inventory finds 288 non-null assertions in 89 production files and ten private fields/methods/parameter properties. Another eight private keywords restrict constructors; those are recorded separately and must not be blindly converted into impossible #constructors. Six any type nodes remain in tests, none in the owned production/tooling inventory. Test non-null assertions are allowed by TS-03 and are not findings.",
  "The announced strict-code migration is incomplete. No actual missing-value runtime failure is established by the count alone.",
  "Narrow/check values through their existing owning rule and replace private storage/methods with runtime private members. Resolve the constructor restriction explicitly in gate policy without broad suppressions. Remove test any types with real boundary fakes.",
  "Type-aware lint with unused-exception reporting, typecheck and focused invariant/negative tests; preserve deterministic wallet outputs.",
);
finding(
  "ARC003",
  "ARC",
  "Main and child wallets maintain the same display policy separately",
  ["CORE-10", "CORE-14"],
  [
    "apps/key-derivation/src/ui/controller.ts",
    "apps/key-derivation/src/ui/bip85-child-wallet-feature.ts",
    "tooling/profile-template.mjs",
  ],
  "BASIC_WINDOW_SIZE=200 and ADVANCED_WINDOW_SIZE=24 are independently declared and used for the same basic/advanced result window in controller.ts:38-39 and bip85-child-wallet-feature.ts:29,35. CHILD_WALLET_ID_PREFIX is also independently declared in the child feature and profile-template. There is no adjacent deliberate-copy justification. The copies gate passes because it detects long token runs, not semantic duplicate constants.",
  "The two wallet displays or composed IDs can drift when only one declaration changes.",
  "Give the shared display/markup contract one owner imported by host and build tooling where possible; preserve separate limits such as CHILD_RESULTS_LIMIT, whose meaning is different even when its value is also 200.",
  "Test both result-window modes and composed child IDs against the shared owner; run composition and copies checks.",
);
finding(
  "ARC004",
  "ARC",
  "An expected password-review wait is thrown as an error",
  ["CORE-22", "TS-06"],
  [
    "apps/key-derivation/src/ui/recovery-mhfe-task.ts",
    "apps/key-derivation/src/ui/recovery-mhfe-fields.ts",
    "apps/key-derivation/src/ui/recovery-mhfe-wallets.ts",
  ],
  "AwaitingAnswer extends Error (task.ts:12). PasswordReview.choose already returns a wait outcome, but require throws AwaitingAnswer at fields.ts:177; task and wallet flow catch it as ordinary expected control flow.",
  "Expected UI progression is mixed with failures, contrary to CORE-22. Existing handlers distinguish it, so no false wallet verdict is alleged.",
  "Carry a typed waiting outcome through the host operation result and reserve thrown errors for refusals. Preserve the upstream MHFE API and pending review ownership.",
  "Password review wait/answer/edit/cancel tests; hidden-wallet session remains usable while waiting and failed operations remain failures.",
);
finding(
  "API001",
  "API",
  "Host errors still rely on names and text instead of stable module codes",
  ["CORE-23", "TS-06"],
  [
    "packages/dash-network/src/provider-http.ts",
    "packages/secret-boundary/src/private-material-error.ts",
    "packages/shared-ui/src/text-file-import.ts",
    "packages/wallet-recovery/src/watch-only.ts",
    "apps/key-derivation/src/workers/derive-client.ts",
    "tooling/tool-build-policy.mjs",
  ],
  "Eight directly Error-derived classes in the inventory declare no code member. AwaitingAnswer, TextFileRefused and InvalidBuildSelection also lack the required Error suffix. There are 979 new Error/TypeError/RangeError constructions in owned production code and 434 in tooling: review inventory, not a count of independently confirmed defects. ProviderHttpError.status and PrivateMaterialError.name are not a module code. Imported MnemoCode/MHFE error catalogs are excluded and must not be hand-edited.",
  "Callers remain coupled to exception classes/text and worker responses discard stable identity; migration is incomplete without demonstrating a new exploit.",
  "Add owning module error identities, retain causes safely and build each frontend's text from codes. Keep refusals separate from expected results. Reuse existing error catalogs where they belong rather than creating a universal core error dependency.",
  "Exact stable-code and refusal controls through real module/worker boundaries, safe diagnostics and existing cleanup/cancellation regressions.",
);
finding(
  "DOC001",
  "DOC",
  "Many library export declarations lack public API contracts",
  ["CORE-20", "TS-11"],
  [
    "packages/coin-protocols/src/coins/bitcoin/index.ts",
    "packages/coin-protocols/src/coins/bitcoin/legacy.ts",
    "packages/coin-protocols/src/bip32-summary.ts",
    "packages/build-security/src/build-info.ts",
  ],
  "413 of 684 top-level exported declarations under owned packages/*/src lack a leading JSDoc block in the syntax inventory. This counts declarations, not API members; re-export declarations and class members are not included. Even a present block still needs manual review for contract/errors/units. Examples include deriveBitcoin and the legacy derivation entry.",
  "Public callers lack the contracts that the new guide requires; a mechanical comment count alone would overstate completion.",
  "Document actual contracts, units, ownership and refusals alongside the owner/module refactoring; reduce unnecessary exports rather than adding meaningless comments.",
  "Code-rules rejects an undocumented public declaration; review representative contracts against actual callers/tests and keep typecheck green.",
);

const checks = [
  {
    name: "CORE syntax inventory",
    command: "node docs/audits/AUD-033-harnesses/core-inventory.mjs",
    outcome: "passed",
    exitCode: 0,
    result:
      "968 owned files inventoried, including 940 TS/JS files parsed; no missing AST inputs. A successful inventory does not mean conformance.",
    evidence: "local AUD-033-evidence/inventory.command.json",
  },
  {
    name: "Current fast gates",
    command: "pnpm check",
    outcome: "passed",
    exitCode: 0,
    result:
      "Metadata, TypeScript and no-copies passed; copies scanned 668 source files. This is not the missing lint/code-rules/clippy gate.",
    evidence: "local AUD-033-evidence/fast-gates.command.json",
  },
  {
    name: "Approved action pins",
    command: "node ../.github/scripts/verify-action-pins.mjs .",
    outcome: "failed",
    exitCode: 1,
    result: "22 CI-01 mismatches",
    evidence: "local AUD-033-evidence/action-pins.command.json",
  },
  {
    name: "Static import graph",
    command: "included in core-inventory.mjs",
    outcome: "passed",
    result: `${graph.modules} modules, ${graph.edges} edges, ${graph.cycles.length} multi-module strongly connected components; ${graph.unresolvedOrExcluded} vendor/unresolved edges outside the graph. Dynamic/virtual imports excluded; not a substitute for import/no-cycle lint.`,
    evidence: "local AUD-033-evidence/import-graph.json",
  },
];
const estimate = {
  units:
    "active implementation and targeted verification hours; a planning estimate, not elapsed machine time or a guarantee",
  rangeHours: [30, 50],
  work: [
    ["Lint/code-rules gates, controls and workflow alignment", "2-4"],
    ["Type narrowing, private fields and public contracts", "6-10"],
    ["Cohesive controller/module, test and template/style splits", "6-10"],
    ["Module error codes and expected-outcome migration", "5-9"],
    ["Manual CORE-01..14 and CORE-51/52 ownership/duplication review", "4-8"],
    ["Rust lint/check integration and scoped source fixes", "1-3"],
    ["Targeted regressions, composition builds and closing review", "2-4"],
  ],
  explanation:
    "The work ranges sum to 26-48 hours; round to 30-50 for integration uncertainty, without treating overlapping fixes twice. Six to twelve hours is a plausible first enforcement tranche, not supportable as full-repository completion. No retained original 6-12-hour statement was available to verify its exact scope.",
  exclusions: [
    "Upstream MHFE/MnemoCode implementation work or waiting for a final package",
    "Full release verification, canonical Docker/WASM rebuild and browser acceptance elapsed time",
    "Commits/pushes, signing and repository history changes",
  ],
  sequencing:
    "The private migration handover requires the current dirty work to be committed before broad restructuring. No commit is authorized here. Finish and review the coherent integration changes, then obtain an explicit commit instruction before starting the separate migration tranche. Do not mix current integration with a wholesale rewrite.",
};
const limitations = [
  "Scoped CORE migration baseline, not a new whole-wallet security, protocol or release audit. Static inventory covers all enumerated owned source files; semantic reading is targeted, not line-by-line proof for all 968 files.",
  "Imported MnemoCode source, generated WASM/MHFE, notices, fixtures, dependency internals, prior audit harnesses/evidence and ignored outputs are excluded from the owned-code counts. Their producer owns their migration. No sibling repository was edited.",
  "No runtime wallet tests, full suite, vector replay, browser suite, Clippy execution, canonical build or release acceptance was performed for this baseline. Earlier results are historical only and are not added to these counts.",
  "Existing examples of owner classes, ErrorCatalog use, strict compiler flags and single-source SSKR policy are retained progress; the migration is partial, not absent. Zero enum nodes and zero production any nodes are positive inventory observations, not full conformance proofs.",
  "Review-only rules added later apply to touched code without a mandatory legacy sweep. A gate introduction covers its whole declared repository scope. The remaining plan must preserve this distinction and avoid unnecessary rewrites or speculative classes.",
  "Function spans include nested functions, blanks/comments and describe wrappers. Public export comments require semantic review. No count is a vulnerability count. Eight private constructor restrictions are not private field violations.",
  "No production, dependency, fixture, workflow or generated file was changed during this baseline. Only this report, its index entry and audit harnesses/evidence were added.",
];
const coverage = [
  [
    "CHECK-ARC-001",
    "failed / partial semantic review",
    "CORE-01..14, CORE-51/52: controller/owner seams and duplication examples; static resolved-import inventory",
  ],
  [
    "CHECK-ARC-002",
    "failed / targeted",
    "CORE-10 and size/type inventory; no global dead-code proof",
  ],
  [
    "CHECK-ARC-003",
    "failed / targeted",
    "CORE-15/20/22/23, TS-03/05/06/11; test names and callback span caveats",
  ],
  [
    "CHECK-BLD-003",
    "passed / limited",
    "Manifest inspection: exact JavaScript pins and existing pnpm lock; no new supply-chain verification",
  ],
  [
    "CHECK-BLD-005",
    "failed / targeted",
    "CORE-43, missing lint/code-rules/Rust gates; CI-01 table checker",
  ],
  [
    "CHECK-DOC-003",
    "passed / scoped",
    "New report paired identities, procedure hashes and validation; historical migration statements preserved",
  ],
];
const outsideScopeChecks = [
  "CHECK-SEC-001",
  "CHECK-SEC-002",
  "CHECK-SEC-003",
  "CHECK-SEC-004",
  "CHECK-SEC-005",
  "CHECK-SEC-006",
  "CHECK-SEC-007",
  "CHECK-FUN-001",
  "CHECK-FUN-002",
  "CHECK-FUN-003",
  "CHECK-FUN-004",
  "CHECK-FUN-005",
  "CHECK-FUN-006",
  "CHECK-FUN-007",
  "CHECK-API-001",
  "CHECK-API-002",
  "CHECK-API-003",
  "CHECK-API-004",
  "CHECK-BLD-001",
  "CHECK-BLD-002",
  "CHECK-BLD-004",
  "CHECK-UI-001",
  "CHECK-UI-002",
  "CHECK-UI-003",
  "CHECK-DOC-001",
  "CHECK-DOC-002",
];
const report = {
  schemaVersion: 1,
  auditId: "AUD-033",
  auditNumber: 33,
  date: "2026-10-15",
  title: "Scoped CORE coding-guide migration baseline and remaining-work estimate",
  reviewer: { name: "Codex; single-session static review", model: null, reasoningEffort: null },
  snapshot: {
    commit: snapshot.commit,
    commitComplete: false,
    workingTree:
      "Dirty integration work present before this review; exact status/diff retained locally. No production changes during this baseline.",
    sourceFingerprint: snapshot.sourceFingerprint,
    ownedCodeFingerprint: inventory.sourceFingerprint,
    fileCount: snapshot.files.length,
    branch: snapshot.branch,
  },
  scope: {
    purpose: "Assess remaining CORE migration and estimate work without starting remediation",
    coverage,
    outsideScopeChecks: outsideScopeChecks.map((checkId) => ({
      checkId,
      outcome: "not-run",
      reason:
        "Outside the explicitly scoped coding-guide baseline; no fresh runtime/security/release result claimed.",
    })),
    ruleGroups: {
      "CORE-01..14,51,52": "targeted owner/seam review; global closure pending",
      "CORE-15": "whole owned-source physical/AST inventory; exclusions require review",
      "CORE-16..21":
        "export/documentation inventory; remaining readability/glossary contracts reviewed during migration",
      "CORE-22..23": "confirmed wait/error and code migration gaps",
      "CORE-24..34,46..50":
        "structural and retained-evidence context only; no new invariant/runtime certification",
      "CORE-35..42":
        "interactive CLI rules do not apply to the four browser frontends; no new independent interactive CLI found",
      "CORE-43..45": "current fast gate run and migration sequencing reviewed",
    },
  },
  checks,
  findings,
  observations: [],
  remediation: findings.map((item) => ({
    id: item.id,
    status: "open",
    fixCommit: null,
    verificationCommit: null,
    evidence: item.evidence,
  })),
  limitations,
  procedureHashes,
  guideHashes,
  environment,
  estimate,
  inventorySummary: inventory.counts,
  completedUTC: new Date().toISOString(),
};
writeFileSync(
  resolve(root, "docs/audits/AUD-033-2026-10-15.json"),
  JSON.stringify(report, null, 2) + "\n",
);
let markdown = `# AUD-033 — Scoped CORE coding-guide migration baseline\n\n## Record metadata\n\n- **Completed (UTC):** ${report.completedUTC}.\n- **Reviewer:** Codex, single-session static review; exact model and reasoning effort unknown. No independent team review claimed.\n- **Reviewed commit:** ${snapshot.commit}; branch ${snapshot.branch}, pre-existing dirty integration work.\n- **Source fingerprint:** ${snapshot.sourceFingerprint} (${snapshot.files.length} non-audit tracked/untracked inputs).\n- **Owned-code inventory:** ${inventory.sourceFingerprint} (968 files).\n- **Artifacts:** Not reviewed or rebuilt.\n\n## Finding register\n\n| Finding ID | Category | Severity | Status | Title |\n| --- | --- | --- | --- | --- |\n`;
markdown = markdown.replace(
  "\n## Finding register",
  `\nEnvironment: ${environment.os} ${environment.architecture}, Node ${environment.node}, pnpm ${environment.pnpm}, TypeScript ${environment.typescript}. Rust, Docker and browsers were not executed.\n\n## Finding register`,
);
for (const item of findings)
  markdown += `| ${item.id} | ${item.category} | low | open | ${item.title} |\n`;
markdown +=
  "\n## Review evidence\n\n### Scope and methodology\n\nThis is the requested CORE-specific baseline and work estimate. It is separate from the already recorded integration remediation. AUD-031 and AUD-032 explicitly leave repository-wide coding-guide migration pending. The current private migration handover and guide were read. All inventoried owned TS/JS inputs were parsed; representative high-impact owners were manually checked. No whole-repository semantic compliance or fresh wallet security certification is claimed. The audit is conducted by this session without subagents; no independent verification is claimed.\n\nThe private handover's prerequisite is to commit current integration work before starting broad restructuring. No commit instruction was given. This baseline preserves that work. New/touched-code review rules and whole-scope newly introduced gates have different applicability; a speculative rewrite of every legacy pure function is not required by this report.\n\n### Coverage ledger\n\n| Check | Outcome | Evidence scope |\n| --- | --- | --- |\n";
for (const row of coverage) markdown += `| ${row.join(" | ")} |\n`;
markdown += `\nThe other procedure checks are explicitly not run for this scoped baseline; their IDs and reasons are in the JSON companion. CORE-24..34/46..50 runtime guarantees are not recertified. CORE-35..42 interactive terminal layout does not apply to the four browser frontends.\n\n### Checks\n\n`;
for (const check of checks)
  markdown += `- **${check.name}: ${check.outcome}**, exit ${check.exitCode ?? "not a separate process"}. Command: \`${check.command}\`. ${check.result} Evidence: ${check.evidence}.\n`;
markdown +=
  "\n### Inventory interpretation\n\n- 584 production files / 88,256 lines; 283 test files / 44,467 lines; 101 tooling files / 16,923 lines. These totals include code, templates and styles under the stated exclusions.\n- 17 files exceed 800 physical lines; 99 function spans exceed 150 physical lines. Nested controllers/callbacks overlap; do not add their lengths as independent work.\n- 288 production non-null assertions in 89 files; ten private fields/methods/parameter properties, plus eight private constructors considered separately.\n- Six test `any` nodes, zero production/tooling `any`, zero enum nodes. Test non-null assertions are allowed.\n- 413 of 684 owned library export declarations lack a leading JSDoc block; this is not a count of all public members or the quality of existing documentation.\n- 979 production generic error constructions are review candidates, not 979 distinct findings.\n\n### Findings\n\n";
for (const item of findings)
  markdown += `#### ${item.id} — Low — ${item.title}\n\n- **Category / status:** ${item.category} / open.\n- **Release blocking:** false for this finding alone; full CORE compliance cannot be claimed.\n- **Rules:** ${item.rules.join(", ")}.\n- **Affected files:** ${item.affectedFiles.map((path) => `[${path}](../../${path})`).join(", ")}.\n- **Reproduction:** ${item.reproduction}\n- **Expected:** ${item.expected}\n- **Observed:** ${item.observed}\n- **Impact:** ${item.impact}\n- **Evidence:** local AUD-033-evidence/inventory.json and the named source; for CI pins, local AUD-033-evidence/action-pins.log.\n- **Recommended fix:** ${item.recommendedFix}\n- **Required verification:** ${item.requiredVerification}\n\n`;
markdown +=
  "### Remediation and follow-up\n\nAll eight findings remain open. Fix and verification commits are null; no remediation was performed in this baseline. Existing integration work remains separate.\n\n### Remaining work and estimate\n\n**Approximately 30–50 active hours** for this repository's remaining migration and targeted verification, subject to the first real lint run and semantic owner review. This is a planning range, not a promise of unattended completion or measured future machine time.\n\n| Work | Active hours |\n| --- | --- |\n";
for (const row of estimate.work) markdown += `| ${row.join(" | ")} |\n`;
markdown += `\n${estimate.explanation}\n\n${estimate.sequencing}\n\nExcluded from the estimate: upstream changes/waiting, full release verification, canonical Docker/WASM regeneration, browser acceptance elapsed time and commit/signing/publication work.\n\n### Informational observations and recommendations\n\nCurrent strict compiler flags, copies gate, imported producer migrations, SskrGroupPolicy, EthereumAddress, secret-owner classes and the new MHFE result adapter establish partial progress. The absence of static graph cycles in the inspected graph is positive but does not close the missing cycle gate. Do not turn the 707 exported production functions into hundreds of forwarding classes; apply CORE-03 with the deep-module/deletion tests and the guide's actual applicability.\n\n### Assessment and limitations\n\n`;
for (const limitation of limitations) markdown += `- ${limitation}\n`;
markdown += "\n### Procedure hashes\n\n";
for (const [path, hash] of Object.entries(procedureHashes)) markdown += `- ${path}: ${hash}.\n`;
markdown += "\nCoding-guide bytes read from the private workspace (SHA-256):\n\n";
for (const [path, hash] of Object.entries(guideHashes)) markdown += `- ${path}: ${hash}.\n`;
writeFileSync(resolve(root, "docs/audits/AUD-033-2026-10-15.md"), markdown);
console.log(
  "Wrote the paired AUD-033 CORE baseline; eight open low-severity conformance findings.",
);
