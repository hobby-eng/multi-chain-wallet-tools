#!/usr/bin/env node
// Runs one command and keeps its evidence: <name>.log with the combined output and
// <name>.command.json with the exact command, UTC start and end, exit code and the
// SHA-256 of the log. The wrapped command's exit code is passed through, so a failing
// check fails this harness as well.
//
// Usage: node docs/audits/AUD-019-harnesses/run-logged.mjs <name> -- <command> [args...]
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EVIDENCE_DIR = process.env.AUDIT_EVIDENCE_DIR ?? "docs/audits/AUD-019-evidence";
// Environment variables that change what a build or test does; they are recorded with
// every command so that a reader can tell an override from the default run.
const RECORDED_ENV = [
  "CARGO_HOME",
  "RUSTUP_HOME",
  "BROWSER_CASES",
  "BROWSER_ENGINES",
  "BROWSER_PROFILE",
  "NODE_OPTIONS",
  "SOURCE_DATE_EPOCH",
  "CI",
];

function usage() {
  console.error("Usage: run-logged.mjs <name> -- <command> [args...]");
  process.exit(2);
}

const [name, separator, command, ...args] = process.argv.slice(2);
if (!name || separator !== "--" || !command || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) usage();

mkdirSync(EVIDENCE_DIR, { recursive: true });
const logPath = join(EVIDENCE_DIR, `${name}.log`);
const recordPath = join(EVIDENCE_DIR, `${name}.command.json`);
const log = createWriteStream(logPath);
const startUtc = new Date().toISOString();

const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (chunk) => {
  log.write(chunk);
  process.stdout.write(chunk);
});
child.stderr.on("data", (chunk) => {
  log.write(chunk);
  process.stderr.write(chunk);
});

child.on("close", (code, signal) => {
  log.end(() => {
    const endUtc = new Date().toISOString();
    const logSha256 = createHash("sha256").update(readFileSync(logPath)).digest("hex");
    const environment = Object.fromEntries(
      RECORDED_ENV.filter((key) => process.env[key] !== undefined).map((key) => [
        key,
        process.env[key],
      ]),
    );
    const record = {
      name,
      command: [command, ...args],
      cwd: process.cwd(),
      environment,
      startUtc,
      endUtc,
      exitCode: code,
      signal,
      log: logPath,
      logSha256,
    };
    writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    process.exit(code ?? 1);
  });
});
