import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PROFILES } from "./build-profiles.mjs";
import { CONTAINER_PLATFORMS, findLaunchers, launcherName } from "./key-derivation-launchers.mjs";

// Builds the Linux and Windows executables of the Key Derivation Tool in Dockerfile.launchers,
// around the Deriver pages already in dist/ from `pnpm build:reproducible`, puts them next to those
// pages and makes the release assets of both editions again with them. Usage:
//   node tooling/build-launchers-reproducible.mjs

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const temporary = mkdtempSync(join(tmpdir(), "multi-chain-wallet-tools-launchers-"));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (exit ${result.status ?? "signal"}).`);
}

try {
  run("docker", [
    "build",
    "--platform",
    "linux/amd64",
    "--network",
    "host",
    "--file",
    "Dockerfile.launchers",
    // The canonical build's dist/ is its own build context: .dockerignore keeps it out of ".".
    "--build-context",
    `dist=${dist}`,
    "--target",
    "launchers",
    "--output",
    `type=local,dest=${temporary}`,
    ".",
  ]);
  for (const profile of Object.values(BUILD_PROFILES)) {
    const { page } = findLaunchers(dist, profile);
    for (const platform of CONTAINER_PLATFORMS) {
      const name = launcherName(basename(page), platform);
      const built = resolve(temporary, "dist", relative(dist, resolve(page, "..")), name);
      copyFileSync(built, resolve(page, "..", name));
      console.log(`Copied ${relative(root, resolve(page, "..", name))}`);
    }
    run(process.execPath, [
      resolve(root, "tooling/create-github-release-assets.mjs"),
      "--profile",
      profile.id,
    ]);
    run(process.execPath, [
      resolve(root, "tooling/verify-github-release-assets.mjs"),
      "--profile",
      profile.id,
    ]);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
