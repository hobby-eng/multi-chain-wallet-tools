#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const harnessDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(harnessDirectory, "../../..");
const evidenceDirectory = path.join(repositoryRoot, "docs/audits/AUD-021-evidence");
const [name, separator, executable, ...args] = process.argv.slice(2);

if (
  !name ||
  !/^[a-z0-9][a-z0-9-]*$/.test(name) ||
  separator !== "--" ||
  !executable ||
  args.length === 0
) {
  console.error(
    "Usage: node docs/audits/AUD-021-harnesses/record-command.mjs <name> -- <command> <arg>...",
  );
  process.exit(2);
}

mkdirSync(evidenceDirectory, { recursive: true });

const logPath = path.join(evidenceDirectory, `${name}.log`);
const commandRecordPath = path.join(evidenceDirectory, `${name}.command.json`);
const log = createWriteStream(logPath, { flags: "wx" });
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const command = [executable, ...args].map(shellQuote).join(" ");
const startedAt = new Date().toISOString();
const safeEnvironment = Object.fromEntries(
  ["CARGO_HOME", "RUSTUP_HOME", "CI", "SOURCE_COMMIT", "SOURCE_DIRTY", "TZ"]
    .filter((key) => process.env[key] !== undefined)
    .map((key) => [key, process.env[key]]),
);

log.write(`Command: ${command}\n`);
log.write(`Working directory: ${repositoryRoot}\n`);
log.write(`Started (UTC): ${startedAt}\n\n`);

const child = spawn(executable, args, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

for (const [streamName, stream] of [
  ["stdout", child.stdout],
  ["stderr", child.stderr],
]) {
  stream.on("data", (chunk) => {
    log.write(`\n[${streamName}]\n`);
    log.write(chunk);
  });
}

let interruptedBy = null;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    interruptedBy = signal;
    child.kill(signal);
  });
}

child.on("error", (error) => {
  log.write(`\n[spawn error] ${error.stack ?? error.message}\n`);
});

child.on("close", (exitCode, signal) => {
  const completedAt = new Date().toISOString();
  log.write(`\nCompleted (UTC): ${completedAt}\n`);
  log.write(`Exit code: ${exitCode ?? "null"}\n`);
  log.write(`Signal: ${signal ?? "none"}\n`);
  log.end(() => {
    const logSha256 = createHash("sha256").update(readFileSync(logPath)).digest("hex");
    const record = {
      command,
      argv: [executable, ...args],
      workingDirectory: repositoryRoot,
      startedAt,
      completedAt,
      exitCode,
      signal,
      interruptedBy,
      environment: safeEnvironment,
      log: `${name}.log`,
      logSha256,
    };
    writeFileSync(commandRecordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
    console.log(`${name}: exit=${exitCode ?? "null"}, log SHA-256=${logSha256}`);
    if (exitCode !== 0 || signal !== null) {
      process.exitCode = exitCode ?? 1;
    }
  });
});
