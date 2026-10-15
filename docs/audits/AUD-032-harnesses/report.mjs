/** Produce the canonical scoped integration record from source-bound retained evidence. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FINDINGS } from "./findings.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const evidence = "docs/audits/AUD-032-evidence";
const read = (path) => readFileSync(resolve(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");
const redact = (value) =>
  JSON.parse(JSON.stringify(value).replace(/\/home\/[^/\s"\\]+/gu, "/home/user"));
const source = json(`${evidence}/final.source.json`);
const identity = json(`${evidence}/final.identity.json`);
const parity = json(`${evidence}/parity-complete.json`);
for (const file of source.files)
  if (hash(file.path) !== file.sha256) throw new Error(`Final source changed: ${file.path}`);

const commands = readdirSync(resolve(root, evidence))
  .filter((name) => name.endsWith(".command.json"))
  .sort()
  .map((name) => {
    const record = json(`${evidence}/${name}`);
    const log = `${evidence}/${name.replace(/\.command\.json$/u, ".log")}`;
    if (hash(log) !== record.logSha256) throw new Error(`Command log changed: ${name}`);
    const output = read(log).replace(/\x1b\[[0-9;]*m/gu, "");
    const { memorySamples, ...summary } = record;
    return {
      name: name.replace(/\.command\.json$/u, ""),
      ...summary,
      recordSha256: hash(`${evidence}/${name}`),
      minimumAvailableGiB: Math.min(
        ...(memorySamples ?? []).map(({ available }) => available / 2 ** 30),
      ),
      counts: output.split("\n").filter((line) => /^\s*(Tests|Test Files)\s/u.test(line)),
      evidence: `local ${evidence}/${name}`,
      log: `local ${log}`,
    };
  });
const passed = (name) => {
  const command = commands.find((record) => record.name === name);
  return (
    command !== undefined &&
    command.exitCode === 0 &&
    command.stopReason === null &&
    command.sourceBefore === source.fingerprint &&
    command.sourceAfter === source.fingerprint
  );
};
const required = [
  "final-targeted",
  "final-gates",
  "final-format",
  "final-parity",
  "final-provenance",
  "final-deriver-multi",
  "final-deriver-dash",
  "final-scanner-multi",
  "final-scanner-dash",
];
if (!required.every(passed))
  throw new Error("Final acceptance commands must pass at one source identity.");
const scopes = new Map([
  [
    "SEC-001",
    "Secret owners: borrowed SSKR buffers, output cleanup, list lifetime and stopped jobs; source plus named fixtures.",
  ],
  [
    "SEC-002",
    "Static offline CSP, sandbox/worker composition and artifact gates in both editions; runtime origin/transport acceptance unexecuted.",
  ],
  [
    "SEC-005",
    "Exceptional paths and late publication through synthetic byte/DOM/worker fixtures; JavaScript wiping is best effort.",
  ],
  [
    "SEC-006",
    "No selector coercion/echo, shared filename admission and source/static artifact boundaries.",
  ],
  [
    "SEC-007",
    "Input/group limits, stopped outcomes, bounded work and one-worker execution; no stress exhaustion.",
  ],
  [
    "FUN-001",
    "Imported quick startup known answers include every BIP39 length and independent legacy-valid literals; full vector replay excluded.",
  ],
  [
    "FUN-002",
    "Actual wallet recognition wrappers and quick coin answers; not a new all-protocol derivation audit.",
  ],
  [
    "FUN-006",
    "MnemoCode operation inventory, SSKR official quorums and targeted host recovery contracts; no exhaustive vectors/gallery.",
  ],
  [
    "FUN-007",
    "Local candidate-file admission/disposal and scan input handoff only; live providers and accounting untouched.",
  ],
  [
    "API-001",
    "Exact 188 portable inputs, 10 bridge pins, native coded refusals and shared pre-narrowing group policy.",
  ],
  [
    "API-002",
    "Worker/job stopping, stale result suppression, shared export capture and save refusal fixtures.",
  ],
  [
    "API-004",
    "Candidate list and share transport contracts plus owner-backed formats; native filesystem/PTY replaced with browser host services.",
  ],
  [
    "BLD-001",
    "Both default editions and the affected no-cards/no-MnemoCode compositions; exact dependency feature gates.",
  ],
  ["BLD-002", "Two targeted selective variants, not the exhaustive build or browser matrix."],
  [
    "BLD-003",
    "Frozen source bytes, source manifests, notices and dependency provenance; unreleased source remains release-ineligible.",
  ],
  [
    "BLD-005",
    "Four fresh local artifacts, checksums, static CSP/ID/WASM/passport checks; no CI/tag/release execution.",
  ],
  [
    "UI-002",
    "Real controllers with synthetic DOM/worker boundaries; compiled fields inventoried per edition, no browser.",
  ],
  [
    "UI-003",
    "Help/QR/save controls traced and job lifecycle regressions; visual/keyboard browser acceptance excluded.",
  ],
  [
    "ARC-001",
    "Shared admission/download/conversion owners and independently exported module inventory.",
  ],
  [
    "ARC-002",
    "The copies gate finds no copies of at least 50 tokens in 662 source files; not a proof of all architectural DRY rules.",
  ],
  [
    "ARC-003",
    "Recorded harness/fixture failures distinguished from product failures and linked to active controller/codec paths.",
  ],
  ["DOC-001", "Updated source/SSKR/self-test/cleanup/edition claims against the library and host."],
  [
    "DOC-002",
    "Pinned notices and documented import commands; frozen ignored evidence is separate from current documents.",
  ],
  [
    "DOC-003",
    "Canonical schema, strict keys, paired findings and source/artifact/command/procedure hash checks.",
  ],
]);
const checks = [
  ...read("docs/FULL_AUDIT_GUIDE.md").matchAll(/^### (CHECK-[A-Z]+-\d{3}) — (.+)$/gmu),
].map(([, checkId, title]) => {
  const suffix = checkId.slice(6);
  return {
    checkId,
    title,
    owner: "Wallet-tools coordinator; remediation without subagents",
    outcome:
      suffix === "BLD-004"
        ? "failed"
        : suffix === "UI-001"
          ? "not-run"
          : scopes.has(suffix)
            ? "passed"
            : "not-run",
    method:
      scopes.get(suffix) ??
      (suffix === "BLD-004"
        ? "Old wallet-tools canonical record correctly refuses imported changed SSKR bytes/inputs. Upstream ten-pin equality is verified separately; Docker comparison is unexecuted."
        : "Outside this scoped integration, unchanged or excluded; prior audit evidence is historical, not newly replayed."),
    sourceFingerprint: source.fingerprint,
  };
});
if (checks.length !== 32) throw new Error("Canonical check inventory changed.");
const findings = FINDINGS.map((finding) => ({
  ...finding,
  kind: "finding",
  status: "verified",
  releaseBlocking: false,
  verificationScope:
    "Source-bound targeted host fixtures and applicable static build gates; no release or real-browser approval.",
})).sort(
  (left, right) => (left.severity === "medium" ? 0 : 1) - (right.severity === "medium" ? 0 : 1),
);
const date = new Date().toISOString().slice(0, 10);
const base = `docs/audits/AUD-032-${date}`;
const procedure = Object.fromEntries(
  [
    "docs/FULL_AUDIT_GUIDE.md",
    "docs/audits/AUDIT_STANDARD.md",
    "docs/audits/AUDIT_TEMPLATE.md",
    "docs/audit-report.schema.json",
  ].map((path) => [path, hash(path)]),
);
const harnesses = Object.fromEntries(
  readdirSync(resolve(root, "docs/audits/AUD-032-harnesses"))
    .sort()
    .map((name) => {
      const path = `docs/audits/AUD-032-harnesses/${name}`;
      return [path, hash(path)];
    }),
);
const minimumAvailableGiB = Math.min(...commands.map((record) => record.minimumAvailableGiB));
const record = redact({
  schemaVersion: 1,
  auditId: "AUD-032",
  auditNumber: 32,
  date,
  title: "MnemoCode AUD-026 integration and complete operation/portable-entry parity follow-up",
  reviewer: { name: "Wallet-tools coordinator", model: null, reasoningEffort: null },
  snapshot: {
    commit: identity.head.trim(),
    commitComplete: false,
    workingTree:
      "Initially clean at 0447031; authorized local MnemoCode synchronization and host fixes remain uncommitted.",
    sourceFingerprint: source.fingerprint,
    sourceManifest: source.files,
  },
  scope: {
    operations:
      "All 38 inventory areas and all 59 package exports, distinguished from 1180 lexical declaration names/internal contracts.",
    editions: ["multi-chain", "dash-community"],
    tools: ["key-derivation", "discovery-scanner"],
    upstreamCommit: "f2d4cffa5d7df369910243734f287ce6521ed033",
    upstreamFingerprint: parity.incomingFingerprint,
    upstreamFiles: parity.incomingFiles,
    exclusions:
      "No real browser, full vectors, PDF gallery, heavy Docker rebuild, Rust compilation, live provider run, coding-guide migration, commit/push/release.",
  },
  checks,
  commands,
  findings,
  observations: [],
  remediation: findings.map(({ id }) => ({
    id,
    status: "verified",
    fixCommit: null,
    verificationCommit: null,
    evidence: [
      `source SHA-256 ${source.fingerprint}`,
      "local AUD-032-evidence/final-targeted.command.json",
      "local AUD-032-evidence/final-gates.command.json",
    ],
    uncommittedSource: true,
  })),
  parity,
  artifacts: parity.artifacts.map((artifact) => ({
    ...artifact,
    sourceFingerprint: source.fingerprint,
    kind: "Fresh local artifact; static acceptance only",
  })),
  procedure,
  harnesses,
  executedCaseCount: 329,
  executedTestFiles: 24,
  minimumAvailableGiB,
  nodeHeapMiB: 768,
  reserveGiB: 3,
  limitations: [
    "Real-browser acceptance is explicitly excluded by the owner; DOM/worker/static results are not a substitute.",
    "The wallet-tools canonical WASM gate fails on the expected SSKR upgrade. Its old record is untouched; a separately authorized canonical Docker comparison is required before release.",
    "The frozen upstream checkout is uncommitted/unreleased. Existing CI/release refusals remain mandatory.",
    "329 is the final targeted run only; earlier overlapping passes/failures are retained and not added to it.",
    "The 38-area matrix includes controls, owning modules, regression references, inputs and native/browser substitutions. It does not claim every possible path ran.",
    "Lexical declarations include interfaces, types, constants and services; 1180 is not a count of user operations or executed checks.",
    "Full-workspace coding-guide migration and legacy size/lint work remain a separate pending handover.",
    "No proof of absence of all bugs, guaranteed memory erasure or independent cryptographic certification.",
  ],
});
writeFileSync(resolve(root, `${base}.json`), JSON.stringify(record, null, 2) + "\n");
const findingText = findings
  .map(
    (finding) =>
      `#### ${finding.id} — ${finding.severity === "medium" ? "Medium" : "Low"} — ${finding.title}\n\n- **Category:** ${finding.category}.\n- **Status:** verified within named targeted scope; uncommitted source.\n- **Release blocking:** false for this defect; overall release gates remain unresolved.\n- **Affected files:** ${finding.affectedFiles.map((path) => `\`${path}\``).join(", ")}.\n- **Reproduction:** ${finding.reproduction}\n- **Expected:** ${finding.expected}\n- **Observed:** ${finding.observed}\n- **Impact:** ${finding.impact}\n- **Fix:** ${finding.recommendedFix}\n- **Required verification:** ${finding.requiredVerification}\n- **Evidence:** ${finding.evidence.join("; ")}.`,
  )
  .join("\n\n");
const markdown = `# AUD-032 — MnemoCode integration and parity follow-up\n\n## Record metadata\n\n- **Audit number:** 32.\n- **Completed (UTC):** ${date}.\n- **Reviewer:** Wallet-tools coordinator; no subagents for remediation.\n- **Model / reasoning effort:** unknown / unknown.\n- **Reviewed commit:** ${record.snapshot.commit}.\n- **Working tree:** initially clean; current authorized synchronization/fixes remain uncommitted.\n- **Source fingerprint:** \`${source.fingerprint}\` (${source.files.length} files).\n- **Upstream:** \`${record.scope.upstreamCommit}\` plus frozen uncommitted source \`${parity.incomingFingerprint}\` (${parity.incomingFiles} files).\n- **Artifacts:** four fresh local HTML files, compiled and statically checked at the exact source fingerprint; no release or browser acceptance.\n\n## Finding register\n\n| Finding ID | Category | Kind | Severity | Status | Title |\n| --- | --- | --- | --- | --- | --- |\n${findings.map((f) => `| ${f.id} | ${f.category} | finding | ${f.severity} | verified (targeted) | ${f.title} |`).join("\n")}\n\n## Review evidence\n\n### Scope and methodology\n\nThe authorized AUD-026 handover is synchronized through the existing checkout. All 188 portable source/asset inputs match the frozen handover. All ten bridge integrity pins and the notices, Rust source/lock and generated files are imported together without modifying upstream bytes. SSKR 0.1.7 now emits Error objects with stable engine codes; the host calls CheckedSskrBridge and snapshots group values before byte narrowing.\n\nThe previous 37-area inventory is reconciled with the word-table operation, producing 38 areas. All 59 package entries are inventoried; the two Node aggregators have explicit host substitutions. 1,180 lexical declaration names include internal types/constants/services and are not separate user operations. Compiled controls: full Deriver 224, Dash Deriver 174, and Scanner 7 per edition. No confirmed missing operation was found within these source traces. Actual browser acceptance is unexecuted.\n\nRepresentations and masking modes, five BIP39 lengths/legacy-valid answers, header/plain/QR input, confirmation/re-encode, backup checking, standard/represented shares, grouped export, damaged-share/date/word/code recovery, wallet references and ranges, candidate-list protection/disposal, card/image/QR/heir outputs and quick/full self-test controls have owning modules and edition control references in the JSON matrix. Tests executed only the stated subset. Native filesystem/PTY protections are replaced by the existing offline document/worker, gated downloads and cleanup services; Poppler image output is replaced by canvas over the same library drawing steps. Dash excludes Bitcoin-key/WIF/xpub evidence and offers Dash/fingerprint matching.\n\nUpstream full vectors, font outline comparisons and its Docker/Rust evidence are retained owner results, not newly executed here. The changed font is hash-bound and embedded in both local Derivers; no PDF gallery is generated.\n\n### Coverage ledger\n\n| Check ID | Outcome | Method / limit |\n| --- | --- | --- |\n${checks.map((check) => `| ${check.checkId} | ${check.outcome} | ${check.method} |`).join("\n")}\n\n### Checks\n\nFinal targeted run: **24 files / 329 cases passed**, one worker, seven seconds. Fast gates pass; no copies of at least 50 tokens in 662 source files. Targeted formatting, mandatory local source/bridge provenance and all four static artifact gates pass. Minimum retained host available memory was ${minimumAvailableGiB.toFixed(3)} GiB; the guard retains a 3 GiB reserve and 768 MiB Node heap.\n\n| Command record | Exit | Scope/counts |\n| --- | --- | --- |\n${record.commands.map((command) => `| ${command.name} | ${command.exitCode} | ${command.counts.join("; ") || "See exact command and local log in JSON"} |`).join("\n")}\n\nExact commands, source-before/after hashes, UTC times, exit codes and log hashes are retained in the paired JSON; machine-local command logs are explicitly marked local. Earlier overlapping counts are not summed. The first integration run had 40 failures: 39 came from an old DOM fixture lacking select collections, and one from stale documentation closure expectations. The repeated attempt before the fixture patch applied is retained. Neither required weakening a production assertion. The parity harness initially used the wrong source-fingerprint serialization; every per-file hash matched and compact JSON restored the owner's fingerprint definition.\n\nThe dependency installer inside the sandbox could not use its existing store and attempted blocked network fetches. Its queued attempt was stopped; frozen dependencies were restored from the existing store offline (81 reused, zero downloaded). Both environment failures are retained. The before-fix SSKR probe had three failures (selector echo, repeated getter reads, old engine string throws) and six passes; the final tests cover the upgraded boundary.\n\nThe old wallet-tools canonical WASM record correctly fails after this imported upgrade. Its failure is retained verbatim in local canonical-gate.log; no manifest waiver, host Docker rebuild or release approval occurred.\n\n### Findings\n\n${findingText}\n\n### Remediation and follow-up\n\n| Finding ID | Status | Fix commit | Verification commit | Evidence |\n| --- | --- | --- | --- | --- |\n${record.remediation.map((fix) => `| ${fix.id} | verified within targeted scope | Uncommitted SHA-256 source | Same source | final-targeted and final-gates local records |`).join("\n")}\n\n### Informational observations and recommendations\n\nThe SSKR version/structured-error upgrade is a dependency handover, separate from the six host defects. Safe download names and temporary conversions have one shared owner each. Selective builds keep only exact shared admission inputs; negative graph controls still refuse unrelated MnemoCode code. The canonical manifest is preserved, and unreleased upstream rejection in CI remains active.\n\n### Assessment and limitations\n\n${record.limitations.map((limit) => `- ${limit}`).join("\n")}\n\nThe complete source/control/export inventory supports local integration review. It does not provide visual browser acceptance or release readiness.\n`;
writeFileSync(resolve(root, `${base}.md`), redact(markdown));
console.log(
  `Generated ${base}.md/.json at source ${source.fingerprint}; release and browsers remain unapproved.`,
);
