import { spawn, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Supply a command and its arguments.");
const GIB = 1024 ** 3;
const BUDGET = 3 * GIB;
const RESERVE = 2 * GIB;
const START_RESERVE = 3 * GIB;
const SAMPLE_MS = 250;
const MAX_COMMAND_MS = 10 * 60 * 1000;

function available() {
  const match = /^MemAvailable:\s+(\d+) kB$/mu.exec(readFileSync("/proc/meminfo", "utf8"));
  if (!match) throw new Error("MemAvailable is unavailable.");
  return Number(match[1]) * 1024;
}

function processes() {
  const rows = new Map();
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/u.test(name)) continue;
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      // Linux stat fields after comm: state (3), PPID (4), and process start time (22).
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const status = readFileSync(`/proc/${name}/status`, "utf8");
      const rss = /^VmRSS:\s+(\d+) kB$/mu.exec(status);
      rows.set(Number(name), {
        state: fields[0],
        parent: Number(fields[1]),
        start: fields[19],
        rss: rss ? Number(rss[1]) * 1024 : 0,
      });
    } catch (cause) {
      if (!["ENOENT", "ESRCH", "EACCES"].includes(cause.code)) throw cause;
    }
  }
  return rows;
}

const initial = available();
if (initial < START_RESERVE) {
  console.error("Insufficient available memory at startup.");
  process.exit(75);
}
const child = spawn(command, args, { stdio: "inherit" });
const owned = new Map();
let peak = 0;
let lowest = initial;
let samples = 0;
let stoppedReason = null;
let rootStart;

const PIDFD_SIGNAL = `
import json, os, signal, sys
from pathlib import Path
for pid, start in json.loads(sys.argv[1]):
    try:
        fd = os.pidfd_open(pid)
    except ProcessLookupError:
        continue
    try:
        actual = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]
        if actual == start:
            signal.pidfd_send_signal(fd, int(sys.argv[2]))
    except (ProcessLookupError, FileNotFoundError):
        pass
    finally:
        os.close(fd)
`;

function signalOwned(signal) {
  const rows = processes();
  const targets = [...owned].filter(([pid, start]) => rows.get(pid)?.start === start);
  // A pidfd targets the captured process even if its numeric PID is reused after the check.
  // POSIX SIGTERM=15 and SIGKILL=9 are passed to Python's standard-library pidfd API.
  const result = spawnSync(
    "python3",
    ["-c", PIDFD_SIGNAL, JSON.stringify(targets), String(signal === "SIGTERM" ? 15 : 9)],
    { stdio: "inherit" },
  );
  if (result.error || result.status !== 0) throw new Error("Owned-process pidfd signaling failed.");
}

function sample() {
  const rows = processes();
  rootStart ??= rows.get(child.pid)?.start;
  let changed;
  do {
    changed = false;
    for (const [pid, row] of rows) {
      if (owned.get(pid) === row.start) continue;
      if (
        (pid === child.pid && row.start === rootStart) ||
        (owned.has(row.parent) && owned.get(row.parent) === rows.get(row.parent)?.start)
      ) {
        owned.set(pid, row.start);
        changed = true;
      }
    }
  } while (changed);
  let rss = 0;
  for (const [pid, start] of owned) if (rows.get(pid)?.start === start) rss += rows.get(pid).rss;
  peak = Math.max(peak, rss);
  lowest = Math.min(lowest, available());
  samples += 1;
  if (stoppedReason === null && (rss > BUDGET || lowest < RESERVE)) {
    stoppedReason =
      rss > BUDGET ? "Owned descendant RSS budget exceeded" : "Available reserve crossed";
    signalOwned("SIGTERM");
    setTimeout(() => signalOwned("SIGKILL"), 3000).unref();
  }
}

// Track PPIDs and process birth times: Node/browser children may create other process groups.
const timer = setInterval(sample, SAMPLE_MS);
sample();
const deadline = setTimeout(() => {
  stoppedReason ??= "Ten-minute bounded command deadline exceeded";
  signalOwned("SIGTERM");
  setTimeout(() => signalOwned("SIGKILL"), 3000).unref();
}, MAX_COMMAND_MS);
child.on("error", (cause) => {
  console.error(cause.message);
  stoppedReason ??= "Command could not start";
});
function livingOwned() {
  const rows = processes();
  return [...owned].filter(([pid, start]) => {
    const row = rows.get(pid);
    return row?.start === start && !["Z", "X"].includes(row.state);
  });
}

async function waitForDescendants(milliseconds) {
  const end = Date.now() + milliseconds;
  while (livingOwned().length && Date.now() < end)
    await new Promise((resolve) => setTimeout(resolve, SAMPLE_MS));
}

child.on("close", async (code) => {
  clearInterval(timer);
  clearTimeout(deadline);
  // Give services whose input pipe just closed a moment to leave; do not abandon live children.
  await waitForDescendants(1000);
  if (livingOwned().length) {
    stoppedReason ??= "Owned descendants remained after command exit";
    signalOwned("SIGTERM");
    await waitForDescendants(1000);
    if (livingOwned().length) signalOwned("SIGKILL");
    await waitForDescendants(3000);
  }
  console.log(
    JSON.stringify({
      ownedTreeMemory: {
        peakRssBytes: peak,
        minimumAvailableBytes: lowest,
        samples,
        stoppedReason,
        rssBudgetBytes: BUDGET,
        availableReserveBytes: RESERVE,
        limitations:
          "Sampled descendants; short-lived or immediately reparented children may be missed; shared pages can be counted twice. Not a hard allocation cap.",
      },
    }),
  );
  process.exitCode = stoppedReason === null ? (code ?? 1) : 75;
});
