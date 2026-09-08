import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuildProfile, profileArtifacts } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const profile = parseBuildProfile();
const artifacts = profileArtifacts(profile);
const lines = artifacts.map((name) => {
  const path = resolve(dist, name);
  if (!existsSync(path)) throw new Error(`Release artifact is missing: dist/${name}.`);
  const prefix = `${profile.outputDirectory}/`;
  if (!name.startsWith(prefix)) throw new Error(`Release artifact is outside ${prefix}: ${name}.`);
  const manifestName = name.slice(prefix.length);
  return `${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${manifestName}`;
});
writeFileSync(resolve(root, profile.manifestPath), `${lines.join('\n')}\n`);
console.log(`Created ${profile.manifestPath} for ${profile.editionName} artifacts.`);
