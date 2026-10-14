import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createBuildInfo } from "../../../tooling/build-metadata.mjs";
import { BUILD_PROFILES } from "../../../tooling/build-profiles.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const evidence = path.join(root, "docs/audits/AUD-022-evidence");
const [name, separator, command, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/u.test(name ?? "") || separator !== "--" || !command) {
  throw new Error("Usage: record-command.mjs <name> -- <command> [args...]");
}
mkdirSync(evidence, { recursive: true });
const output = path.join(evidence, `${name}.log`);
const fd = openSync(output, "wx");
const startedAt = new Date().toISOString();
const sourceFingerprintBefore = createBuildInfo(
  root,
  "audit",
  BUILD_PROFILES["multi-chain"],
).fingerprint;
// Only audit-owned process groups are stopped; unrelated desktop processes are never touched.
const memoryLimitBytes = 14 * 1024 ** 3;
const child = spawn(command, args, {
  cwd: root,
  detached: true,
  stdio: ["ignore", fd, fd],
  env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=1536" },
});
let peakUsedBytes = 0;
let stoppedForMemory = false;
let spawnError = null;
const stop = () => {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
};
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
const monitor = setInterval(() => {
  const memory = readFileSync("/proc/meminfo", "utf8");
  const value = (key) => Number(memory.match(new RegExp(`^${key}:\\s+(\\d+)`, "mu"))[1]) * 1024;
  const used = value("MemTotal") - value("MemAvailable");
  peakUsedBytes = Math.max(peakUsedBytes, used);
  if (used > memoryLimitBytes) {
    stoppedForMemory = true;
    stop();
  }
}, 1000);
child.on("error", (error) => {
  spawnError = String(error);
});
child.on("close", (exitCode, signal) => {
  clearInterval(monitor);
  closeSync(fd);
  const record = {
    argv: [command, ...args],
    workingDirectory: root,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode,
    signal,
    spawnError,
    memoryLimitBytes,
    peakUsedBytes,
    stoppedForMemory,
    environment: { NODE_OPTIONS: "--max-old-space-size=1536" },
    sourceFingerprintBefore,
    sourceFingerprintAfter: createBuildInfo(root, "audit", BUILD_PROFILES["multi-chain"])
      .fingerprint,
    log: `${name}.log`,
    logSha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
  };
  writeFileSync(
    path.join(evidence, `${name}.command.json`),
    JSON.stringify(record, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(`${name}: exit=${exitCode}, memory-stop=${stoppedForMemory}`);
  process.exitCode = stoppedForMemory || signal || spawnError ? 1 : (exitCode ?? 1);
});
