/** Validate the canonical pair, strict JSON keys and retained local source/evidence bindings. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const evidence = resolve(root, "docs/audits/AUD-031-evidence");
const hash = (path) =>
  createHash("sha256")
    .update(readFileSync(resolve(root, path)))
    .digest("hex");

function strictJson(path) {
  const text = readFileSync(resolve(root, path), "utf8");
  const value = JSON.parse(text);
  const stack = [];
  for (const token of text.match(
    /"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/gu,
  ) ?? []) {
    if (token === "{") stack.push({ keys: new Set(), expecting: true });
    else if (token === "[") stack.push({ keys: undefined });
    else if (token === "}" || token === "]") stack.pop();
    else {
      const frame = stack.at(-1);
      if (frame?.keys !== undefined && token === ",") frame.expecting = true;
      if (frame?.keys !== undefined && frame.expecting && token.startsWith('"')) {
        const key = JSON.parse(token);
        if (frame.keys.has(key)) throw new Error(`Duplicate JSON key in ${path}: ${key}`);
        frame.keys.add(key);
        frame.expecting = false;
      }
    }
  }
  return value;
}

const schema = strictJson("docs/audit-report.schema.json");
function validate(value, rule, path = "report") {
  if (rule.$ref !== undefined) {
    const target = rule.$ref
      .slice(2)
      .split("/")
      .reduce((node, key) => node[key], schema);
    validate(value, target, path);
  }
  for (const component of rule.allOf ?? []) validate(value, component, path);
  const type =
    value === null
      ? "null"
      : Array.isArray(value)
        ? "array"
        : Number.isInteger(value)
          ? "integer"
          : typeof value;
  if (
    rule.type !== undefined &&
    ![]
      .concat(rule.type)
      .some((expected) => expected === type || (expected === "number" && type === "integer"))
  )
    throw new Error(`Wrong schema type: ${path}`);
  if (rule.const !== undefined && value !== rule.const)
    throw new Error(`Wrong schema constant: ${path}`);
  if (rule.enum !== undefined && !rule.enum.includes(value))
    throw new Error(`Wrong schema enum: ${path}`);
  if (
    typeof value === "string" &&
    ((rule.pattern !== undefined && !new RegExp(rule.pattern, "u").test(value)) ||
      value.length < (rule.minLength ?? 0))
  )
    throw new Error(`Wrong schema string: ${path}`);
  if (typeof value === "number" && value < (rule.minimum ?? -Infinity))
    throw new Error(`Wrong schema minimum: ${path}`);
  if (Array.isArray(value) && rule.items !== undefined)
    value.forEach((item, index) => validate(item, rule.items, `${path}[${index}]`));
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const key of rule.required ?? [])
      if (!(key in value)) throw new Error(`Missing schema field: ${path}.${key}`);
    for (const [key, definition] of Object.entries(rule.properties ?? {}))
      if (key in value) validate(value[key], definition, `${path}.${key}`);
  }
}

const reportPath = "docs/audits/AUD-031-2026-10-14.json";
const markdownPath = "docs/audits/AUD-031-2026-10-14.md";
const report = strictJson(reportPath);
const markdown = readFileSync(resolve(root, markdownPath), "utf8");
validate(report, schema);
if (
  report.checks.length !== 32 ||
  report.parity.operations.length !== 37 ||
  report.artifacts.length !== 4
)
  throw new Error("Incomplete coverage or artifact record");
if (new Set(report.findings.map((finding) => finding.id)).size !== report.findings.length)
  throw new Error("Duplicate finding IDs");
for (const finding of report.findings)
  if (!markdown.includes(finding.id)) throw new Error("Missing paired finding");
if (/\/home\/(?!user(?:\/|\s|"|$))[^/\s]+/u.test(JSON.stringify(report) + markdown))
  throw new Error("Unredacted home path");
for (const source of report.snapshot.sourceManifest)
  if (hash(source.path) !== source.sha256) throw new Error(`Source changed: ${source.path}`);
for (const artifact of report.artifacts)
  if (hash(artifact.path) !== artifact.sha256)
    throw new Error(`Artifact changed: ${artifact.path}`);
for (const [path, expected] of Object.entries(report.procedure))
  if (hash(path) !== expected) throw new Error(`Procedure changed: ${path}`);
for (const [path, expected] of Object.entries(report.harnesses))
  if (hash(path) !== expected) throw new Error(`Harness changed: ${path}`);
const sums =
  readdirSync(evidence)
    .filter((name) => name !== "SHA256SUMS" && name !== "report-validation.json")
    .sort()
    .map((name) => `${hash(`docs/audits/AUD-031-evidence/${name}`)}  ${name}`)
    .join("\n") + "\n";
writeFileSync(resolve(evidence, "SHA256SUMS"), sums);
writeFileSync(
  resolve(evidence, "report-validation.json"),
  JSON.stringify(
    {
      validatedAtUtc: new Date().toISOString(),
      schema: "PASS",
      strictJsonKeys: "PASS",
      sourceAndArtifacts: "PASS",
      checks: 32,
      operationAreas: 37,
      artifacts: 4,
      realBrowsers: false,
      releaseApproval: false,
      reportSha256: hash(reportPath),
      markdownSha256: hash(markdownPath),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "AUD-031 schema, strict JSON keys, 32 checks, 37 operation traces and four artifact bindings pass; no product checks replayed.",
);
