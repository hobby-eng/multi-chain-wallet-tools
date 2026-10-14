/** Generate the scoped follow-up from exact local command, source and operation evidence. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const evidence = resolve(root, "docs/audits/AUD-031-evidence");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");
const redact = (value) =>
  JSON.parse(JSON.stringify(value).replace(/\/home\/[^/\s"\\]+/gu, "/home/user"));
const source = json("docs/audits/AUD-031-evidence/final.source.json");
const identity = json("docs/audits/AUD-031-evidence/final.identity.json");
const parity = json("docs/audits/AUD-031-evidence/parity-final.json");
for (const file of source.files)
  if (hash(file.path) !== file.sha256) throw new Error(`Source changed: ${file.path}`);
for (const row of parity.operations)
  for (const [path, expected] of Object.entries(row.bindingSha256))
    if (hash(path) !== expected) throw new Error(`Parity source changed: ${path}`);

const commands = readdirSync(evidence)
  .filter((name) => name.endsWith(".command.json"))
  .sort()
  .map((name) => {
    const record = JSON.parse(readFileSync(resolve(evidence, name), "utf8"));
    const log = name.replace(/\.command\.json$/u, ".log");
    if (hash(`docs/audits/AUD-031-evidence/${log}`) !== record.logSha256)
      throw new Error(`Evidence changed: ${name}`);
    const output = readFileSync(resolve(evidence, log), "utf8").replace(/\x1b\[[0-9;]*m/gu, "");
    return {
      name: name.replace(/\.command\.json$/u, ""),
      ...record,
      recordSha256: hash(`docs/audits/AUD-031-evidence/${name}`),
      counts: output.split("\n").filter((line) => /^\s*(Test Files|Tests)\s/u.test(line)),
    };
  });
const passed = (name) => {
  const record = commands.find((command) => command.name === name);
  return (
    record !== undefined &&
    record.exitCode === 0 &&
    record.stopReason === null &&
    record.sourceBefore === record.sourceAfter &&
    record.sourceAfter === source.fingerprint
  );
};
const verified = passed("targeted-final") && passed("final-fast-gates");
const findings = [
  {
    id: "AUD-031-API001",
    category: "API",
    kind: "finding",
    severity: "medium",
    title: "Worker replies lose stable refusal code and native error kind",
    reproduction:
      "Send a synthetic coded RangeError reply through MnemoCodeWorker. The before-fix test expected RangeError and failed because the client reconstructed plain Error without code.",
    expected:
      "Keep the immutable module code, safe refusal message and native Error/TypeError/RangeError kind; never serialize arbitrary cause or private buffers.",
    observed:
      "The worker sent only message and the client created new Error(message). Unknown thrown values were stringified.",
    impact:
      "Hosts cannot reliably distinguish a module refusal from another failure; stringifying an unknown fault may repeat supplied text. No real secret disclosure or browser exploit was demonstrated.",
    recommendedFix:
      "Use the shared MnemoCodeWorkerProtocol for deliberate error-field transport and native reconstruction, with generic safe text for uncoded operational faults.",
    requiredVerification:
      "Coded kind/code/message controls, immutable code, cause exclusion and unknown-fault privacy fixtures; real-browser acceptance remains unexecuted.",
    evidence: [
      "local AUD-031-evidence/worker-code-before.command.json",
      "local AUD-031-evidence/targeted-final.command.json",
    ],
  },
  {
    id: "AUD-031-API002",
    category: "API",
    kind: "finding",
    severity: "medium",
    title: "Host search adapters still treat library cancellation as an error or completed result",
    reproduction:
      "Abort a word/date wallet callback or deliver a library stopped reply. The old host imported assertStillRunning, ignored returned stopped state and used error text to identify cancellation; this is incompatible with the frozen library contract.",
    expected:
      "A stop remains distinct from no-match, a question, a complete candidate list and an operational failure. Suppress and wipe candidate bytes completed after the stop.",
    observed:
      "Adapters retained throw-based checks and built completed search/list presentation from partial library results. Worker termination rejected with a message which the page parsed.",
    impact:
      "Interrupted work can be misclassified and incomplete results can look final. Evidence is source-contract analysis plus bounded public-fixture controls; it does not demonstrate loss of funds.",
    recommendedFix:
      "Return stopped results, reuse one publication/wipe owner, discard them in the shared job boundary, and leave stopped Re-encode wallet comparisons unconfirmed.",
    requiredVerification:
      "Pre-aborted and callback-stopped searches, late candidate-byte wipe, stopped job versus operational fault, Re-encode confirmation and share-controller regressions.",
    evidence: [
      "local AUD-031-evidence/targeted-final.command.json",
      "local AUD-031-evidence/final-fast-gates.command.json",
    ],
  },
].map((finding) => ({
  ...finding,
  status: verified ? "verified" : "fixed",
  releaseBlocking: !verified,
  verificationScope:
    "Named targeted source-bound fixtures only; not release or complete real-browser acceptance.",
}));
const guide = read("docs/FULL_AUDIT_GUIDE.md");
const scoped = new Set([
  "CHECK-SEC-005",
  "CHECK-SEC-006",
  "CHECK-FUN-006",
  "CHECK-API-001",
  "CHECK-API-002",
  "CHECK-API-004",
  "CHECK-BLD-001",
  "CHECK-BLD-003",
  "CHECK-UI-002",
  "CHECK-UI-003",
  "CHECK-ARC-001",
  "CHECK-ARC-002",
  "CHECK-DOC-001",
  "CHECK-DOC-003",
]);
const checks = [...guide.matchAll(/^### (CHECK-[A-Z]+-\d{3}) — (.+)$/gmu)].map(([, id, title]) => ({
  checkId: id,
  title,
  owner: "Coordinator; no subagents",
  method: scoped.has(id)
    ? "37-area control/owner trace, exact vendor binding and named bounded checks"
    : "Scope disposition only; prior full audit results remain historical",
  outcome: id === "CHECK-UI-001" ? "not-run" : scoped.has(id) ? "scoped-evidence" : "not-replayed",
  evidence: scoped.has(id)
    ? [
        "local AUD-031-evidence/parity-final.json",
        "local AUD-031-evidence/targeted-final.command.json",
      ]
    : [],
  gap: "Actual browsers, full vectors, bulk rendering, broad suites and release acceptance were not executed.",
}));
if (checks.length !== 32 || parity.operations.length !== 37)
  throw new Error("Incomplete procedure/operation coverage");
const artifacts = [
  "multi-chain-edition/key-derivation/Wallet_Key_Derivation_Tool.html",
  "dash-community-edition/key-derivation/Dash_Community_Key_Derivation_Tool.html",
  "multi-chain-edition/discovery-scanner/Wallet_Discovery_Scanner.html",
  "dash-community-edition/discovery-scanner/Dash_Community_Discovery_Scanner.html",
].map((path) => ({
  path: `dist/${path}`,
  sha256: hash(`dist/${path}`),
  sourceFingerprint: commands.find(
    (c) => c.name === (path.includes("key-derivation") ? "html-deriver" : "html-scanner"),
  ).sourceAfter,
}));
const procedures = [
  "docs/FULL_AUDIT_GUIDE.md",
  "docs/audits/AUDIT_STANDARD.md",
  "docs/audits/AUDIT_TEMPLATE.md",
  "docs/audit-report.schema.json",
];
const report = redact({
  schemaVersion: 1,
  auditId: "AUD-031",
  auditNumber: 31,
  date: "2026-10-14",
  title: "MnemoCode frozen handover, stopped outcomes and coded worker refusals",
  completedAtUtc: identity.capturedAtUtc,
  reviewer: {
    name: "Codex coordinator; source review and targeted execution without subagents",
    model: null,
    reasoningEffort: null,
  },
  snapshot: {
    commit: identity.head.trim(),
    commitComplete: false,
    workingTree: "Existing dirty primary checkout; unrelated edits preserved; no commit/push",
    sourceFingerprint: source.fingerprint,
    sourceManifest: source.files,
  },
  scope:
    "Authorized scoped integration/remediation follow-up on all 37 handed-over MnemoCode service areas. No new full-repository audit or release verification.",
  procedure: Object.fromEntries(procedures.map((path) => [path, hash(path)])),
  checks,
  findings,
  observations: [],
  commands,
  parity,
  artifacts,
  remediation: findings.map((finding) => ({
    id: finding.id,
    status: finding.status,
    fixCommit: null,
    verificationCommit: null,
    evidence: finding.evidence,
  })),
  limitations: [
    "All 37 areas have actual control/owner/regression references; that static trace is not 37 newly executed browser scenarios. Unexecuted regressions are referenced as available evidence only.",
    "The frozen owner handover covers 167 mapped source files; 18 asset/vector files match their retained pins. All 185 vendored files were compared byte-for-byte. No algorithm, format, Rust or WASM rebuild was part of this task.",
    "The final targeted run passed 135 cases; the earlier 44-case run overlaps it and is not added. Scanner plaintext controls passed six separate cases. Failed before-fix and compiler runs remain retained.",
    "No actual browsers, gallery/PDF generation, full-cost vector replay, full test suite, paid CI, live wallet/provider checks, Docker, launchers, commit, push or release.",
    "Only Deriver and Scanner HTML in both editions are current here; other pre-existing dist artifacts and old release manifests are not re-certified.",
    "The vendor manifest remains unreleased; CI/reproducible-release refusal is unchanged. Actual browser/feature-matrix and release approval remain open. JavaScript memory erasure is not guaranteed.",
    "Repository-wide coding-guide migration is a separate pending handover; this continuation adopts its rules in new and touched code without claiming all legacy modules were restructured.",
    "The final user documentation was updated after the targeted tests and focused builds. Those records retain their own source fingerprints; the final source differs only by that documentation, and findings remain conservatively fixed rather than newly verified.",
  ],
  harnesses: Object.fromEntries(
    readdirSync(resolve(root, "docs/audits/AUD-031-harnesses")).map((name) => [
      `docs/audits/AUD-031-harnesses/${name}`,
      hash(`docs/audits/AUD-031-harnesses/${name}`),
    ]),
  ),
});
const rows = [
  "# AUD-031 — MnemoCode frozen handover and browser integration",
  "",
  "## Record metadata",
  "",
  `- **Audit number:** 31.`,
  `- **Completed (UTC):** ${report.completedAtUtc}.`,
  "- **Reviewer:** Codex coordinator; no subagents.",
  "- **Model and reasoning effort:** unknown (null).",
  `- **Reviewed commit:** ${report.snapshot.commit}; uncommitted source is authoritative.`,
  `- **Source fingerprint:** ${source.fingerprint}.`,
  "- **Working tree:** pre-existing dirty checkout; no commit or publication.",
  "- **Artifacts:** four focused HTML builds, listed below; no browser or release acceptance.",
  "",
  "## Finding register",
  "",
  "| ID | Category | Severity | Status | Title |",
  "| --- | --- | --- | --- | --- |",
  ...findings.map((f) => `| ${f.id} | ${f.category} | ${f.severity} | ${f.status} | ${f.title} |`),
  "",
  "## Review evidence",
  "",
  "### Scope and methodology",
  "",
  report.scope,
  "",
  `Upstream frozen fingerprint: ${parity.sourceFingerprint}; ${parity.mappedFiles} files exactly matched. Both editions use their admitted coins and features. Terminal prompts/CANCELLED are not imported.`,
  "",
  "Procedure SHA-256:",
  ...Object.entries(report.procedure).map(([path, sha]) => `- ${path}: ${sha}.`),
  "",
  "### Coverage ledger",
  "",
  "| Check | Outcome | Method / remaining gap |",
  "| --- | --- | --- |",
  ...checks.map((c) => `| ${c.checkId} | ${c.outcome} | ${c.method}; ${c.gap} |`),
  "",
  "### Checks",
  "",
  "Counts remain per command; overlapping reruns are not added.",
  "",
  "| Command label | Exit / stop | Observed counts | Log SHA-256 |",
  "| --- | --- | --- | --- |",
  ...report.commands.map(
    (c) =>
      `| ${c.name} | ${c.exitCode} / ${c.stopReason ?? "none"} | ${c.counts.join("; ").replaceAll("|", "\\|") || "not a case count"} | ${c.logSha256} |`,
  ),
  "",
  "Exact commands, timings, memory samples and source before/after bindings are in the paired JSON. Raw logs and records are local in ignored AUD-031-evidence.",
  "",
  "### Operation trace",
  "",
  "| Handed-over area | Real control | Controller → host owner | Contract and regression reference |",
  "| --- | --- | --- | --- |",
  ...parity.operations.map(
    (o) =>
      `| ${o.operation.replaceAll("|", "\\|")} | ${o.control} | ${o.controller} → ${o.owner} | ${o.semantics}; ${o.regression} (not all executed) |`,
  ),
  "",
  "### Findings",
  "",
];
for (const f of findings)
  rows.push(
    `#### ${f.id} — ${f.severity} — ${f.title}`,
    "",
    ...[
      "status",
      "reproduction",
      "expected",
      "observed",
      "impact",
      "recommendedFix",
      "requiredVerification",
    ].map((key) => `- **${key}:** ${f[key]}`),
    `- **Evidence:** ${f.evidence.join("; ")}.`,
    "",
  );
rows.push(
  "### Remediation and follow-up",
  "",
  "| ID | Status | Fix commit | Verification commit | Evidence |",
  "| --- | --- | --- | --- | --- |",
  ...report.remediation.map(
    (f) => `| ${f.id} | ${f.status} | none | none | ${f.evidence.join("; ")} |`,
  ),
  "",
  "### Informational observations and recommendations",
  "",
  "No additional feature, optional refactor or review wave was started. Shared worker protocol and candidate publication owners avoid per-tab copies.",
  "",
  "### Artifacts",
  "",
  ...artifacts.map((a) => `- ${a.path}: ${a.sha256}.`),
  "",
  "### Assessment and limitations",
  "",
  ...report.limitations.map((s) => `- ${s}`),
  "",
);
writeFileSync(
  resolve(root, "docs/audits/AUD-031-2026-10-14.json"),
  JSON.stringify(report, null, 2) + "\n",
);
writeFileSync(resolve(root, "docs/audits/AUD-031-2026-10-14.md"), rows.join("\n"));
console.log(
  `Generated AUD-031 with ${checks.length} procedure dispositions and ${parity.operations.length} operation traces; no checks were replayed.`,
);
