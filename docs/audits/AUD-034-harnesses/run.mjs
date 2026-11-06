/** Records one bounded audit command without changing its exit status or hiding partial logs. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readdirSync, writeFileSync, writeSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [label, command, ...args] = process.argv.slice(2);
if (!label || !/^[a-z0-9-]+$/u.test(label) || !command) throw new Error("Expected label and command.");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const output = resolve(root, "docs/audits/AUD-034-evidence");
const logPath = resolve(output, `${label}.log`);
const harnessDirectory = resolve(root, "docs/audits/AUD-034-harnesses");
const harnessInputs = readdirSync(harnessDirectory).sort().filter((path) => /\.(?:mjs|py|md)$/u.test(path))
  .map((path) => ({ path: `docs/audits/AUD-034-harnesses/${path}`, sha256: createHash("sha256").update(readFileSync(resolve(harnessDirectory, path))).digest("hex") }));
const started = new Date().toISOString();
const log = openSync(logPath, "w");
const child = spawn(command, args, { cwd: root, env: process.env, stdio: ["ignore", log, log] });
let spawnError;
child.on("error", (cause) => { spawnError = cause.message; writeSync(log, `${cause.message}\n`); });
const { code, signal } = await new Promise((done) => child.on("close", (code, signal) => done({ code, signal })));
closeSync(log);
const record = { label, command: [command, ...args], startedUtc: started, endedUtc: new Date().toISOString(),
  exitCode: code, signal, ...(spawnError ? { spawnError } : {}), nodeOptions: process.env.NODE_OPTIONS ?? null, harnessInputs,
  log: `docs/audits/AUD-034-evidence/${label}.log`, logSha256: createHash("sha256").update(readFileSync(logPath)).digest("hex") };
writeFileSync(resolve(output, `${label}.command.json`), JSON.stringify(record, null, 2) + "\n");
console.log(JSON.stringify({ label, exitCode: code, signal, logSha256: record.logSha256 }));
process.exitCode = code ?? 1;
