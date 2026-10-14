// Runs another script of the repository with this Node, as every build and check step does.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

/**
 * Runs `script` (from the repository root) with `args`. A failure ends this process with the
 * script's status, or, with `throwOnFailure`, throws so that the caller can clean up first.
 */
export function runNodeScript(script, args = [], { throwOnFailure = false } = {}) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status === 0) return;
  if (throwOnFailure) throw new Error(`${script} failed with status ${result.status}.`);
  process.exit(result.status ?? 1);
}

/** Whether the module at `moduleUrl` (its import.meta.url) is the script Node was started with. */
export function isMainScript(moduleUrl) {
  return process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(moduleUrl);
}
