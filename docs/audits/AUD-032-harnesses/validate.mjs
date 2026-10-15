/** Reuse the frozen schema/key validator and validate this report's own complete bindings. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");
const retained = "docs/audits/AUD-031-harnesses/validate.mjs";
const retainedReport = JSON.parse(
  readFileSync(resolve(root, "docs/audits/AUD-031-2026-10-14.json"), "utf8"),
);
if (hash(retained) !== retainedReport.harnesses[retained])
  throw new Error("Frozen validator identity changed.");
const text = readFileSync(resolve(root, retained), "utf8");
const start = text.indexOf("function strictJson(");
const end = text.indexOf("const reportPath =");
if (start < 0 || end <= start) throw new Error("Frozen validator boundaries changed.");
// Only hash-checked definitions run; the old report's command/verification body never executes.
const { strictJson, validate } = runInNewContext(
  text.slice(start, end) + "\n({ strictJson, validate });",
  {
    readFileSync,
    resolve,
    root,
  },
);
const reportPath = process.argv[2];
if (
  reportPath === undefined ||
  !/^docs\/audits\/AUD-032-\d{4}-\d{2}-\d{2}\.json$/u.test(reportPath)
)
  throw new Error("Usage: validate.mjs docs/audits/AUD-032-YYYY-MM-DD.json");
const record = strictJson(reportPath);
validate(record, strictJson("docs/audit-report.schema.json"));
const markdownPath = reportPath.replace(/\.json$/u, ".md");
const markdown = readFileSync(resolve(root, markdownPath), "utf8");
if (
  record.checks.length !== 32 ||
  record.parity.operations.length !== 38 ||
  record.parity.exportedParts.length !== 59 ||
  record.artifacts.length !== 4
)
  throw new Error("Incomplete procedure, operation, portable-entry or artifact inventory.");
if (new Set(record.findings.map(({ id }) => id)).size !== record.findings.length)
  throw new Error("Duplicate finding IDs.");
for (const finding of record.findings)
  if (!markdown.includes(finding.id)) throw new Error(`Missing paired finding: ${finding.id}`);
if (/\/home\/(?!user(?:\/|\s|"|$))[^/\s]+/u.test(JSON.stringify(record) + markdown))
  throw new Error("Unredacted home path.");
for (const file of record.snapshot.sourceManifest)
  if (hash(file.path) !== file.sha256) throw new Error(`Final source changed: ${file.path}`);
for (const artifact of record.artifacts)
  if (
    hash(artifact.path) !== artifact.sha256 ||
    artifact.sourceFingerprint !== record.snapshot.sourceFingerprint
  )
    throw new Error(`Artifact/source binding changed: ${artifact.path}`);
for (const area of record.parity.operations)
  for (const [path, expected] of Object.entries(area.bindingSha256))
    if (hash(path) !== expected) throw new Error(`Operation binding changed: ${path}`);
for (const bindings of [record.procedure, record.harnesses])
  for (const [path, expected] of Object.entries(bindings))
    if (hash(path) !== expected) throw new Error(`Procedure/harness changed: ${path}`);
for (const command of record.commands) {
  if (
    hash(command.evidence.slice(6)) !== command.recordSha256 ||
    hash(command.log.slice(6)) !== command.logSha256
  )
    throw new Error(`Retained command/log changed: ${command.name}`);
}
for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
  const target = match[1].split("#")[0];
  if (target !== "" && !/^[a-z]+:/iu.test(target))
    readFileSync(resolve(root, "docs/audits", target));
}
const evidence = "docs/audits/AUD-032-evidence";
const sums =
  readdirSync(resolve(root, evidence))
    .filter((name) => !["SHA256SUMS", "report-validation.json"].includes(name))
    .sort()
    .map((name) => `${hash(`${evidence}/${name}`)}  ${name}`)
    .join("\n") + "\n";
writeFileSync(resolve(root, evidence, "SHA256SUMS"), sums);
writeFileSync(
  resolve(root, evidence, "report-validation.json"),
  JSON.stringify(
    {
      completedAtUtc: new Date().toISOString(),
      schema: "PASS",
      strictJsonKeys: "PASS",
      sourceArtifactsCommandsProcedureHarnesses: "PASS",
      checks: 32,
      operationAreas: 38,
      exportedParts: 59,
      cases: 329,
      artifacts: 4,
      reportSha256: hash(reportPath),
      markdownSha256: hash(markdownPath),
      actualBrowsers: false,
      releaseApproval: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "AUD-032 schema, strict keys, paired findings and all retained bindings pass; no product checks replayed.",
);
