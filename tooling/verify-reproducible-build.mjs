import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifact = resolve(root, 'dist/key-derivation/Wallet_Key_Derivation_Tool.html');
const viewerArtifact = resolve(root, 'dist/activity-viewer/Wallet_Activity_Viewer.html');
const recoveryArtifact = resolve(root, 'dist/discovery-scanner/Wallet_Discovery_Scanner.html');
const wasm = resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm');
const reuseGeneratedWasm = process.argv.includes('--reuse-generated-wasm');

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function run(script) {
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const firstArtifact = digest(artifact);
const firstViewerArtifact = digest(viewerArtifact);
const firstRecoveryArtifact = digest(recoveryArtifact);
const firstWasm = digest(wasm);
if (!reuseGeneratedWasm) run('tooling/build-shielded-wasm.mjs');
run('apps/key-derivation/scripts/build-key-derivation-html.mjs');
run('apps/activity-viewer/scripts/build-activity-viewer-html.mjs');
run('apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs');
const secondArtifact = digest(artifact);
const secondViewerArtifact = digest(viewerArtifact);
const secondRecoveryArtifact = digest(recoveryArtifact);
const secondWasm = digest(wasm);

if (firstWasm !== secondWasm) throw new Error('Two consecutive pinned builds produced different WASM bytes.');
if (firstArtifact !== secondArtifact) throw new Error('Two consecutive pinned builds produced different HTML bytes.');
if (firstViewerArtifact !== secondViewerArtifact) {
  throw new Error('Two consecutive pinned builds produced different viewer HTML bytes.');
}
if (firstRecoveryArtifact !== secondRecoveryArtifact) {
  throw new Error('Two consecutive pinned builds produced different recovery HTML bytes.');
}
// This establishes determinism on one machine with one pinned toolchain. It is
// not evidence of reproducibility for an independent verifier on different
// hardware or a different OS; that needs a second build in a pinned container.
console.log(
  `Verified same-machine build determinism${reuseGeneratedWasm ? ' using the checked-in, runtime-verified WASM input' : ' including a pinned WASM rebuild'}: `
  + `key derivation ${secondArtifact}; activity viewer ${secondViewerArtifact}; discovery scanner ${secondRecoveryArtifact}`,
);
