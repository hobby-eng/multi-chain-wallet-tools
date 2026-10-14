import { runNodeScript } from "./run-script.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertEmbeddedWasmWithoutBuilderPaths } from "./builder-paths.mjs";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "./build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scripts = {
  "key-derivation": "apps/key-derivation/scripts/verify-key-derivation-artifact.mjs",
  "activity-viewer": "apps/activity-viewer/scripts/verify-activity-viewer-artifact.mjs",
  "discovery-scanner": "apps/discovery-scanner/scripts/verify-discovery-scanner-artifact.mjs",
  "psbt-inspector": "apps/psbt-inspector/scripts/verify-psbt-inspector-artifact.mjs",
};

for (const profileId of Object.keys(BUILD_PROFILES)) {
  for (const toolId of profileToolIds(BUILD_PROFILES[profileId])) {
    const script = scripts[toolId];
    if (script === undefined) throw new Error(`Missing artifact verifier for ${toolId}.`);
    runNodeScript(script, ["--profile", profileId]);
    // No WebAssembly module in a finished page may name the computer it was built on.
    const artifact = getToolBuild(BUILD_PROFILES[profileId], toolId).artifactRelativePath;
    assertEmbeddedWasmWithoutBuilderPaths(
      readFileSync(resolve(root, "dist", artifact), "utf8"),
      artifact,
    );
  }
  const manifest = spawnSync(
    process.execPath,
    [resolve(root, "tooling/verify-release-manifest.mjs"), "--profile", profileId],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  if (manifest.error !== undefined) throw manifest.error;
  if (manifest.status !== 0) process.exit(manifest.status ?? 1);
}

const isolation = spawnSync(
  process.execPath,
  [resolve(root, "tooling/verify-dash-community-artifacts.mjs")],
  {
    cwd: root,
    stdio: "inherit",
  },
);
if (isolation.error !== undefined) throw isolation.error;
if (isolation.status !== 0) process.exit(isolation.status ?? 1);
