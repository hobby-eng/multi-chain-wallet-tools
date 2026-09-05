import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES, getToolBuild } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const wasm = resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm');
const reuseGeneratedWasm = process.argv.includes('--reuse-generated-wasm');

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(script, args = []) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const artifacts = Object.values(BUILD_PROFILES).flatMap((profile) => (
  ['key-derivation', 'activity-viewer', 'discovery-scanner'].map((toolId) => ({
    label: `${profile.id}/${toolId}`,
    path: resolve(root, 'dist', getToolBuild(profile, toolId).artifactRelativePath),
  }))
));
const missingArtifacts = artifacts.filter(({ path }) => !existsSync(path)).map(({ label }) => label);
if (missingArtifacts.length > 0) {
  throw new Error(`Build both profiles before checking determinism. Missing: ${missingArtifacts.join(', ')}`);
}
const firstArtifacts = new Map(artifacts.map(({ label, path }) => [label, digest(path)]));
const firstWasm = digest(wasm);
if (!reuseGeneratedWasm) run('tooling/build-shielded-wasm.mjs');
for (const profile of Object.values(BUILD_PROFILES)) {
  for (const script of [
    'apps/key-derivation/scripts/build-key-derivation-html.mjs',
    'apps/activity-viewer/scripts/build-activity-viewer-html.mjs',
    'apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs',
  ]) run(script, ['--profile', profile.id]);
}
const secondWasm = digest(wasm);

if (firstWasm !== secondWasm) throw new Error('Two consecutive pinned builds produced different WASM bytes.');
for (const { label, path } of artifacts) {
  if (firstArtifacts.get(label) !== digest(path)) {
    throw new Error(`Two consecutive pinned builds produced different ${label} HTML bytes.`);
  }
}
// This establishes determinism on one machine with one pinned toolchain. It is
// not evidence of reproducibility for an independent verifier on different
// hardware or a different OS; that needs a second build in a pinned container.
console.log(
  `Verified same-machine build determinism for both editions${reuseGeneratedWasm ? ' using the checked-in, runtime-verified WASM input' : ' including a pinned WASM rebuild'}.`,
);
