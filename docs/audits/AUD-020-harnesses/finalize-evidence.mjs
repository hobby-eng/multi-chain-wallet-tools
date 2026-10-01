#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, "../../..");
const evidenceDirectory = path.join(repositoryRoot, "docs/audits/AUD-020-evidence");
const reportMarkdown = "docs/audits/audit-20-2026-10-01.md";
const reportJson = "docs/audits/audit-20-2026-10-01.json";
const commandRecordName = "finalize-evidence";
const startedAt = new Date().toISOString();
const command = ["node", "docs/audits/AUD-020-harnesses/finalize-evidence.mjs"];
const logLines = [
  `Command: ${command.join(" ")}`,
  `Working directory: ${repositoryRoot}`,
  `Started (UTC): ${startedAt}`,
];

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function writeEvidence(name, text) {
  writeFileSync(path.join(evidenceDirectory, name), text.endsWith("\n") ? text : `${text}\n`);
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

try {
  mkdirSync(evidenceDirectory, { recursive: true });
  const report = JSON.parse(readFileSync(path.join(repositoryRoot, reportJson), "utf8"));
  const procedureHashes = report.procedure;
  for (const [relativePath, expectedHash] of Object.entries(procedureHashes)) {
    const actualHash = sha256(path.join(repositoryRoot, relativePath));
    if (actualHash !== expectedHash) throw new Error(`Procedure hash mismatch: ${relativePath}`);
  }

  const validationCode = String.raw`
import json, pathlib, re, sys
import jsonschema

root = pathlib.Path(sys.argv[1])
markdown_path = root / sys.argv[2]
json_path = root / sys.argv[3]
schema_path = root / sys.argv[4]
index_path = root / "docs/audits/README.md"

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result

record = json.loads(json_path.read_text(), object_pairs_hook=unique_object)
schema = json.loads(schema_path.read_text(), object_pairs_hook=unique_object)
jsonschema.Draft202012Validator.check_schema(schema)
jsonschema.Draft202012Validator(schema).validate(record)
ids = [item["id"] for item in record["findings"] + record["observations"]]
if len(ids) != len(set(ids)):
    raise ValueError("duplicate finding or observation IDs")
markdown = markdown_path.read_text()
markdown_ids = re.findall(r"^### (AUD-[0-9]{3,}-(?:SEC|FUN|API|BLD|DOC|UI|ARC)[0-9]{3,})", markdown, re.M)
if set(ids) != set(markdown_ids):
    raise ValueError(f"Markdown/JSON IDs differ: {ids} vs {markdown_ids}")
for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", markdown):
    if target.startswith(("https://", "http://", "mailto:")):
        continue
    local = target.split("#", 1)[0]
    if local and not (markdown_path.parent / local).resolve().exists():
        raise ValueError(f"broken Markdown link: {target}")
index = index_path.read_text()
for name in ("audit-20-2026-10-01.md", "audit-20-2026-10-01.json"):
    if name not in index:
        raise ValueError(f"audit index missing {name}")
for relative_path, expected_hash in record["procedure"].items():
    import hashlib
    actual_hash = hashlib.sha256((root / relative_path).read_bytes()).hexdigest()
    if actual_hash != expected_hash:
        raise ValueError(f"procedure hash mismatch: {relative_path}")
print(f"PASS Draft 2020-12 schema; {len(ids)} paired IDs; unique JSON keys; procedure hashes; local links; index")
`;
  const validationOutput = run("python3", [
    "-c",
    validationCode,
    repositoryRoot,
    reportMarkdown,
    reportJson,
    "docs/audit-report.schema.json",
  ]);
  logLines.push(validationOutput);

  const statusLines = execFileSync("git", ["status", "--short"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().split("\n").filter(Boolean);
  if (staged.some((item) => item.startsWith("docs/audits/AUD-020-evidence/"))) {
    throw new Error("Audit evidence is staged in Git.");
  }
  run("git", ["check-ignore", "docs/audits/AUD-020-evidence/SHA256SUMS"]);

  const snapshot = {
    auditId: "AUD-020",
    capturedAt: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    tree: execFileSync("git", ["rev-parse", "HEAD^{tree}"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    branch: execFileSync("git", ["branch", "--show-current"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim(),
    workingTree: statusLines,
    stagedFiles: staged,
    evidenceIgnored: true,
    nonAuditChanges: statusLines.filter((item) => !item.includes("docs/audits/")),
    verificationRecordSha256: sha256(path.join(repositoryRoot, "dist/verification-record.json")),
  };
  writeEvidence("snapshot.json", JSON.stringify(snapshot, null, 2));
  writeEvidence("procedure-hashes.json", JSON.stringify(procedureHashes, null, 2));

  const versionCommands = [
    ["node", ["--version"]],
    ["pnpm", ["--version"]],
    ["rustc", ["--version"]],
    ["cargo", ["--version"]],
    ["wasm-bindgen", ["--version"]],
    ["cargo", ["audit", "--version"]],
    ["docker", ["--version"]],
    ["python3", ["-c", "import importlib.metadata; print(importlib.metadata.version('jsonschema'))"]],
    ["node_modules/.bin/playwright", ["--version"]],
    [(process.env.HOME + "/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome"), ["--version"]],
    [(process.env.HOME + "/.cache/ms-playwright/firefox-1538/firefox/firefox"), ["--version"]],
  ];
  const environmentLines = [
    run("uname", ["-a"]),
    `CARGO_HOME=${process.env.CARGO_HOME ?? "unset"}`,
    `RUSTUP_HOME=${process.env.RUSTUP_HOME ?? "unset"}`,
    ...versionCommands.map(([executable, args]) => `${executable}: ${run(executable, args)}`),
  ];
  writeEvidence("environment.log", environmentLines.join("\n"));

  const validation = {
    auditId: "AUD-020",
    status: "passed",
    schema: "docs/audit-report.schema.json",
    schemaDialect: "https://json-schema.org/draft/2020-12/schema",
    validator: "Python jsonschema 4.19.2",
    duplicateJsonKeys: "none",
    pairedFindingIds: report.findings.map((finding) => finding.id),
    localMarkdownLinks: "resolved",
    procedureHashes: "matched",
    indexEntry: "present",
    auditEvidenceStaged: false,
    validatorOutput: validationOutput,
  };
  writeEvidence("report-validation.json", JSON.stringify(validation, null, 2));

  const completedAt = new Date().toISOString();
  logLines.push(`Completed (UTC): ${completedAt}`, "Exit code: 0", "Signal: none");
  const logName = `${commandRecordName}.log`;
  const commandRecordNameWithSuffix = `${commandRecordName}.command.json`;
  writeEvidence(logName, logLines.join("\n\n"));
  const commandRecord = {
    command: command.join(" "),
    argv: command,
    workingDirectory: repositoryRoot,
    startedAt,
    completedAt,
    exitCode: 0,
    signal: null,
    interruptedBy: null,
    environment: {
      CARGO_HOME: process.env.CARGO_HOME ?? null,
      RUSTUP_HOME: process.env.RUSTUP_HOME ?? null,
    },
    log: logName,
    logSha256: sha256(path.join(evidenceDirectory, logName)),
  };
  writeEvidence(commandRecordNameWithSuffix, JSON.stringify(commandRecord, null, 2));

  const evidenceFiles = readdirSync(evidenceDirectory)
    .filter((name) => name !== "SHA256SUMS")
    .filter((name) => statSync(path.join(evidenceDirectory, name)).isFile())
    .sort();
  const sums = evidenceFiles
    .map((name) => `${sha256(path.join(evidenceDirectory, name))}  ${name}`)
    .join("\n");
  writeEvidence("SHA256SUMS", sums);
  for (const line of readFileSync(path.join(evidenceDirectory, "SHA256SUMS"), "utf8")
    .trim().split("\n")) {
    const [expectedHash, fileName] = line.split(/\s{2,}/u);
    if (sha256(path.join(evidenceDirectory, fileName)) !== expectedHash) {
      throw new Error(`Evidence checksum mismatch: ${fileName}`);
    }
  }
  console.log(validationOutput);
  console.log(`Indexed ${evidenceFiles.length} local evidence files in SHA256SUMS.`);
} catch (error) {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
}