import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuildProfile, profileArtifacts } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const profile = parseBuildProfile();
const manifest = readFileSync(resolve(root, profile.manifestPath), 'utf8').trim().split('\n');
const expectedNames = new Set(profileArtifacts(profile).map((name) => (
  profile.id === 'dash-community' ? name.replace(/^dash-community\//u, '') : name
)));

if (manifest.length !== expectedNames.size) throw new Error('SHA256SUMS must contain exactly three release artifacts.');
for (const line of manifest) {
  const match = /^([0-9a-f]{64})  ([a-z0-9-]+\/[A-Za-z0-9_.-]+)$/u.exec(line);
  if (match === null) throw new Error(`Malformed SHA256SUMS line: ${line}`);
  const [, recorded, name] = match;
  if (!expectedNames.delete(name)) throw new Error(`Unexpected or duplicate release artifact: ${name}`);
  const artifactName = profile.id === 'dash-community' ? `dash-community/${name}` : name;
  const path = resolve(dist, artifactName);
  if (relative(dist, path) !== artifactName) throw new Error(`Unsafe release artifact name: ${name}`);
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (recorded !== actual) throw new Error(`Release manifest checksum mismatch for ${name}.`);
}
if (expectedNames.size !== 0) throw new Error(`Release manifest is missing: ${[...expectedNames].join(', ')}`);
console.log(`Verified ${profile.manifestPath} for ${profile.editionName} artifacts.`);
