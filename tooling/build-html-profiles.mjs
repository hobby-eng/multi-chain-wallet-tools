import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES, profileToolIds } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const requested = process.argv.includes('--profile')
  ? process.argv[process.argv.indexOf('--profile') + 1]
  : process.argv.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length);
const profileIds = requested === undefined ? Object.keys(BUILD_PROFILES) : [requested];
const scripts = {
  'key-derivation': 'apps/key-derivation/scripts/build-key-derivation-html.mjs',
  'activity-viewer': 'apps/activity-viewer/scripts/build-activity-viewer-html.mjs',
  'discovery-scanner': 'apps/discovery-scanner/scripts/build-discovery-scanner-html.mjs',
  'psbt-inspector': 'apps/psbt-inspector/scripts/build-psbt-inspector-html.mjs',
};

for (const profileId of profileIds) {
  if (BUILD_PROFILES[profileId] === undefined) {
    throw new Error(`Unknown build profile "${profileId}". Expected multi-chain or dash-community.`);
  }
  for (const toolId of profileToolIds(BUILD_PROFILES[profileId])) {
    const script = scripts[toolId];
    if (script === undefined) throw new Error(`Missing build script for ${toolId}.`);
    const result = spawnSync(process.execPath, [resolve(root, script), '--profile', profileId], {
      cwd: root,
      stdio: 'inherit',
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  const manifest = spawnSync(
    process.execPath,
    [resolve(root, 'tooling/create-release-manifest.mjs'), '--profile', profileId],
    { cwd: root, stdio: 'inherit' },
  );
  if (manifest.error !== undefined) throw manifest.error;
  if (manifest.status !== 0) process.exit(manifest.status ?? 1);
}
