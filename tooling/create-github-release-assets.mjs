import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBuildProfile } from "./build-profiles.mjs";
import { createReleaseAssets } from "./github-release-assets.mjs";

// Makes the flat GitHub release assets of a profile in its release folder from the build in dist/.
// Usage: node tooling/create-github-release-assets.mjs [--profile multi-chain]

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profile = parseBuildProfile();
createReleaseAssets(root, resolve(root, "dist"), profile, resolve(root, profile.releaseDirectory));
console.log(`Created flat ${profile.editionName} release assets in ${profile.releaseDirectory}/.`);
