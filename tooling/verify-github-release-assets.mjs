import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getToolBuild, parseBuildProfile } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const profile = parseBuildProfile();
const release = resolve(root, profile.releaseDirectory);
const expectedArtifacts = [
  getToolBuild(profile, 'activity-viewer').artifactName,
  getToolBuild(profile, 'discovery-scanner').artifactName,
  getToolBuild(profile, 'key-derivation').artifactName,
];
const expectedFiles = new Set([
  ...expectedArtifacts,
  ...expectedArtifacts.map((name) => `${name}.sha256`),
  'LICENSE',
  'SHA256SUMS',
]);
const actualFiles = readdirSync(release).sort();

if (actualFiles.length !== expectedFiles.size || actualFiles.some((name) => !expectedFiles.has(name))) {
  throw new Error(`Unexpected GitHub release asset set: ${actualFiles.join(', ')}`);
}

const lines = readFileSync(resolve(release, 'SHA256SUMS'), 'utf8').trim().split('\n');
if (lines.length !== expectedArtifacts.length + 1) {
  throw new Error('Flat SHA256SUMS must contain the three standalone HTML files and LICENSE.');
}

const remaining = new Set([...expectedArtifacts, 'LICENSE']);
for (const line of lines) {
  const match = /^([0-9a-f]{64})  ([A-Za-z0-9_.-]+)$/u.exec(line);
  if (match === null) throw new Error(`Malformed flat SHA256SUMS line: ${line}`);
  const [, recorded, name] = match;
  if (basename(name) !== name || !remaining.delete(name)) {
    throw new Error(`Unexpected or duplicate flat release artifact: ${name}`);
  }
  const actual = createHash('sha256').update(readFileSync(resolve(release, name))).digest('hex');
  if (recorded !== actual) throw new Error(`Flat release checksum mismatch for ${name}.`);
  if (name !== 'LICENSE' && readFileSync(resolve(release, `${name}.sha256`), 'utf8').trim() !== `${actual}  ${name}`) {
    throw new Error(`Flat release sidecar mismatch for ${name}.`);
  }
}
if (remaining.size !== 0) throw new Error(`Flat release manifest is missing: ${[...remaining].join(', ')}`);
if (readFileSync(resolve(release, 'LICENSE'), 'utf8') !== readFileSync(resolve(root, 'LICENSE'), 'utf8')) {
  throw new Error('Flat release LICENSE differs from the root project license.');
}
console.log(`Verified the exact flat ${profile.editionName} release asset set and all checksums.`);
