import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PROFILES } from "./build-profiles.mjs";
import {
  CONTAINER_PLATFORMS,
  findLaunchers,
  launcherName,
  removeLegacyLaunchers,
} from "./key-derivation-launchers.mjs";
import { runCommand } from "./run-script.mjs";

// Builds the Linux and Windows executables of the Key Derivation Tool in Dockerfile.launchers,
// around the Deriver pages already in dist/ from `pnpm build:reproducible`, puts them next to those
// pages and makes the release assets of both editions again with them. Usage:
//   node tooling/build-launchers-reproducible.mjs

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = resolve(root, "dist");
const temporary = mkdtempSync(join(tmpdir(), "multi-chain-wallet-tools-launchers-"));

try {
  runCommand("docker", [
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
    removeLegacyLaunchers(page);
    for (const platform of CONTAINER_PLATFORMS) {
      const name = launcherName(basename(page), platform);
      const built = resolve(temporary, "dist", relative(dist, resolve(page, "..")), name);
      copyFileSync(built, resolve(page, "..", name));
      console.log(`Copied ${relative(root, resolve(page, "..", name))}`);
    }
    runCommand(process.execPath, [
      resolve(root, "tooling/create-github-release-assets.mjs"),
      "--profile",
      profile.id,
    ]);
    runCommand(process.execPath, [
      resolve(root, "tooling/verify-github-release-assets.mjs"),
      "--profile",
      profile.id,
    ]);
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
