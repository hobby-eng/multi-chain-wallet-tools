/** Run one targeted command with the retained memory guard and fresh AUD-031 evidence. */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const [label, ...command] = process.argv.slice(2);
if (label === undefined || !/^[a-z0-9-]+$/u.test(label) || command.length === 0)
  throw new Error("Usage: node run.mjs FRESH-LABEL COMMAND [ARGS]");

// Reuse the frozen recorder rather than copying its limits, process cleanup or evidence format.
const program = String.raw`
import fcntl, pathlib, runpy, sys
root = pathlib.Path(sys.argv[1])
guard = runpy.run_path(str(root / "docs/audits/AUD-030-harnesses/run.py"))["recorder"]()
settings = guard.check.__globals__
settings["EVIDENCE"] = root / "docs/audits/AUD-031-evidence"
settings["EVIDENCE"].mkdir(exist_ok=True)
capture = runpy.run_path(str(root / "docs/audits/AUD-028-harnesses/capture.py"))["AuditCapture"](root, 31)
guard.source = capture.source
with open("/tmp/wallet-tools-heavy-check.lock", "a") as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    raise SystemExit(guard.check(sys.argv[2], sys.argv[3:]))
`;
const result = spawnSync("python3", ["-B", "-c", program, root, label, ...command], {
  cwd: root,
  stdio: "inherit",
});
if (result.error !== undefined) throw result.error;
process.exitCode = result.status ?? 1;
