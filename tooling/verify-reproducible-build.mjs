import { WASM_MODULES } from "./wasm-modules.mjs";
import { runNodeScript } from "./run-script.mjs";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_PROFILES, getToolBuild, profileToolIds } from "./build-profiles.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const wasmFiles = WASM_MODULES.map((module) => resolve(root, module.wasmPath));
const reuseGeneratedWasm = process.argv.includes("--reuse-generated-wasm");

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const run = runNodeScript;

const artifacts = Object.values(BUILD_PROFILES).flatMap((profile) =>
  profileToolIds(profile).map((toolId) => ({
    label: `${profile.id}/${toolId}`,
    path: resolve(root, "dist", getToolBuild(profile, toolId).artifactRelativePath),
  })),
);
const missingArtifacts = artifacts
  .filter(({ path }) => !existsSync(path))
  .map(({ label }) => label);
if (missingArtifacts.length > 0) {
  throw new Error(
    `Build both profiles before checking determinism. Missing: ${missingArtifacts.join(", ")}`,
  );
}
const firstArtifacts = new Map(artifacts.map(({ label, path }) => [label, digest(path)]));
const firstWasm = wasmFiles.map(digest);
if (!reuseGeneratedWasm) run("tooling/build-all-wasm.mjs");
for (const profile of Object.values(BUILD_PROFILES)) {
  for (const toolId of profileToolIds(profile)) {
    const script = getToolBuild(profile, toolId).buildScript;
    if (script === undefined) throw new Error(`Missing reproducible build script for ${toolId}.`);
    run(script, ["--profile", profile.id]);
  }
}
const secondWasm = wasmFiles.map(digest);

if (firstWasm.some((value, index) => value !== secondWasm[index])) {
  throw new Error("Two consecutive pinned builds produced different WASM bytes.");
}
for (const { label, path } of artifacts) {
  if (firstArtifacts.get(label) !== digest(path)) {
    throw new Error(`Two consecutive pinned builds produced different ${label} HTML bytes.`);
  }
}
// This establishes determinism on one machine with one pinned toolchain. It is
// not evidence of reproducibility for an independent verifier on different
// hardware or a different OS; that needs a second build in a pinned container.
console.log(
  `Verified same-machine build determinism for both editions${reuseGeneratedWasm ? " using the checked-in, runtime-verified WASM input" : " including a pinned WASM rebuild"}.`,
);
