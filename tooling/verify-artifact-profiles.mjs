import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scripts = [
  'apps/key-derivation/scripts/verify-key-derivation-artifact.mjs',
  'apps/activity-viewer/scripts/verify-activity-viewer-artifact.mjs',
  'apps/discovery-scanner/scripts/verify-discovery-scanner-artifact.mjs',
  'tooling/verify-release-manifest.mjs',
];

for (const profileId of Object.keys(BUILD_PROFILES)) {
  for (const script of scripts) {
    const result = spawnSync(process.execPath, [resolve(root, script), '--profile', profileId], {
      cwd: root,
      stdio: 'inherit',
    });
    if (result.error !== undefined) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

const isolation = spawnSync(process.execPath, [resolve(root, 'tooling/verify-dash-community-artifacts.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (isolation.error !== undefined) throw isolation.error;
if (isolation.status !== 0) process.exit(isolation.status ?? 1);
