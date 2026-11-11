import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBuildProfile } from "./build-profiles.mjs";
import { verifyReleaseAssets } from "./github-release-assets.mjs";

// Checks the exact flat GitHub release assets of a profile and their one checksum file. Usage:
//   node tooling/verify-github-release-assets.mjs [--profile multi-chain] [--all-launchers]
// --all-launchers, used by the release workflows, requires the executable for every platform.

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = parseBuildProfile();
verifyReleaseAssets(root, profile, resolve(root, profile.releaseDirectory), {
  allLaunchers: process.argv.includes("--all-launchers"),
});
console.log(`Verified the exact flat ${profile.editionName} release asset set and all checksums.`);
