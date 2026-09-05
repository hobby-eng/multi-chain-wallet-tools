import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBuildProfile, profileArtifacts } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const profile = parseBuildProfile();
const release = resolve(root, profile.releaseDirectory);
const artifacts = profileArtifacts(profile);

rmSync(release, { force: true, recursive: true });
mkdirSync(release, { recursive: true });

const manifest = [];
for (const relativeSource of artifacts) {
  const source = resolve(dist, relativeSource);
  const sourceSidecar = `${source}.sha256`;
  if (!existsSync(source) || !existsSync(sourceSidecar)) {
    throw new Error(`Release artifact or sidecar is missing: dist/${relativeSource}. Run the HTML build first.`);
  }

  const name = basename(source);
  const bytes = readFileSync(source);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const expectedSidecar = `${digest}  ${name}`;
  if (readFileSync(sourceSidecar, 'utf8').trim() !== expectedSidecar) {
    throw new Error(`Checksum sidecar does not match ${relativeSource}.`);
  }

  copyFileSync(source, resolve(release, name));
  writeFileSync(resolve(release, `${name}.sha256`), `${expectedSidecar}\n`);
  manifest.push(`${digest}  ${name}`);
}

const licenseSource = resolve(root, 'LICENSE');
if (!existsSync(licenseSource)) {
  throw new Error('Root LICENSE is missing.');
}
const licenseName = 'LICENSE';
const licenseBytes = readFileSync(licenseSource);
const licenseDigest = createHash('sha256').update(licenseBytes).digest('hex');
copyFileSync(licenseSource, resolve(release, licenseName));
manifest.push(`${licenseDigest}  ${licenseName}`);

writeFileSync(resolve(release, 'SHA256SUMS'), `${manifest.sort().join('\n')}\n`);
console.log(`Created flat ${profile.editionName} release assets in ${profile.releaseDirectory}/.`);
