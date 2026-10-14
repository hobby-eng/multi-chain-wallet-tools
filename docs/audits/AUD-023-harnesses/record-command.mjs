// Runs one audit command and keeps a local record of it: the log, exact argv, UTC interval, exit
// code, log SHA-256 and the source fingerprint before and after. Adapted from AUD-022's recorder
// for a host with about 15 GiB of RAM that other programs share (see README.md).
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createBuildInfo } from "../../../tooling/build-metadata.mjs";
import { BUILD_PROFILES } from "../../../tooling/build-profiles.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const evidence = path.join(root, "docs/audits/AUD-023-evidence");
const [name, separator, command, ...args] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/u.test(name ?? "") || separator !== "--" || !command) {
  throw new Error("Usage: record-command.mjs <name> -- <command> [args...]");
}
mkdirSync(evidence, { recursive: true });
const output = path.join(evidence, `${name}.log`);
const fd = openSync(output, "wx");
const fingerprint = () => createBuildInfo(root, "audit", BUILD_PROFILES["multi-chain"]).fingerprint;
const startedAt = new Date().toISOString();
const sourceFingerprintBefore = fingerprint();
// The command's process group is stopped when the host's available memory falls below this floor,
// so that the kernel never has to choose a victim among the owner's programs.
const memoryFloorBytes = 700 * 1024 ** 2;
// A raised OOM score, inherited by every child, makes the audit command the kernel's first choice
// if memory runs out between two samples.
const child = spawn("sh", ["-c", 'echo 1000 > /proc/self/oom_score_adj; exec "$@"', "sh", command, ...args], {
  cwd: root,
  detached: true,
  stdio: ["ignore", fd, fd],
});
let lowestAvailableBytes = Number.POSITIVE_INFINITY;
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
  const available = Number(memory.match(/^MemAvailable:\s+(\d+)/mu)[1]) * 1024;
  lowestAvailableBytes = Math.min(lowestAvailableBytes, available);
  if (available < memoryFloorBytes && !stoppedForMemory) {
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
    memoryFloorBytes,
    lowestAvailableBytes: Number.isFinite(lowestAvailableBytes) ? lowestAvailableBytes : null,
    stoppedForMemory,
    sourceFingerprintBefore,
    sourceFingerprintAfter: fingerprint(),
    log: `${name}.log`,
    logSha256: createHash("sha256").update(readFileSync(output)).digest("hex"),
  };
  writeFileSync(path.join(evidence, `${name}.command.json`), JSON.stringify(record, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(`${name}: exit=${exitCode}, memory-stop=${stoppedForMemory}`);
  process.exitCode = stoppedForMemory || signal || spawnError ? 1 : (exitCode ?? 1);
});
