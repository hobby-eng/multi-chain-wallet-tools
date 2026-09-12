import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES, getToolBuild, profileToolIds } from './build-profiles.mjs';
import { createBuildInfo } from './build-metadata.mjs';
import { readReleaseMetadata } from './project-metadata.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : 'full';
if (!['full', 'ci', 'bundle'].includes(mode)) throw new Error('Verification record mode must be full, ci, or bundle.');
const release = readReleaseMetadata(root);
const digest = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');
const artifacts = [];
for (const profile of Object.values(BUILD_PROFILES)) {
  for (const toolId of profileToolIds(profile)) {
    const tool = getToolBuild(profile, toolId);
    const path = `dist/${tool.artifactRelativePath}`;
    if (!existsSync(resolve(root, path))) throw new Error(`Cannot record missing artifact: ${path}`);
    const sha256 = digest(path);
    if (readFileSync(resolve(root, `${path}.sha256`), 'utf8').trim() !== `${sha256}  ${tool.artifactName}`) {
      throw new Error(`Cannot record artifact with an invalid sidecar: ${path}`);
    }
    artifacts.push({ profile: profile.id, tool: toolId, path, bytes: readFileSync(resolve(root, path)).byteLength, sha256 });
  }
}
const generatedDirectory = resolve(root, 'packages/dash-shielded-wasm/generated');
const wasm = readdirSync(generatedDirectory).sort().map(name => {
  const path = `packages/dash-shielded-wasm/generated/${name}`;
  return { path, bytes: readFileSync(resolve(root, path)).byteLength, sha256: digest(path) };
});
let commit = process.env.VERIFICATION_COMMIT;
let dirty = process.env.VERIFICATION_DIRTY === 'true';
if (commit === undefined) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
  } catch {
    commit = 'unavailable';
  }
}
if (commit !== 'unavailable' && !/^[0-9a-f]{40}$/u.test(commit)) throw new Error('VERIFICATION_COMMIT must be a full lowercase Git commit.');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const dockerfile = readFileSync(resolve(root, 'Dockerfile.reproducible'), 'utf8');
const pin = (pattern, label) => {
  const value = pattern.exec(dockerfile)?.[1];
  if (value === undefined) throw new Error(`Missing ${label} pin in Dockerfile.reproducible.`);
  return value;
};
const record = {
  schema: 'https://github.com/hobby-eng/multi-chain-wallet-tools/blob/main/docs/verification-record.schema.json',
  schemaVersion: 1,
  project: manifest.name,
  version: release.version,
  sourceDate: release.releaseDate,
  commit,
  dirty,
  sourceFingerprint: createBuildInfo(root, getToolBuild(BUILD_PROFILES['multi-chain'], 'key-derivation').checksumFile, BUILD_PROFILES['multi-chain']).fingerprint,
  verification: {
    command: mode === 'full' ? 'pnpm verify' : mode === 'ci' ? 'pnpm verify:ci' : 'pnpm release:bundle',
    result: mode === 'bundle' ? 'artifacts-recorded' : 'passed',
    checks: mode === 'bundle' ? [] : [
      'metadata-and-project-facts', 'typescript', 'vitest', 'dip13-differential',
      'orchard-stream-and-wasm', 'cryptographic-self-tests', 'artifact-build-and-profile-gates',
      'reproducible-html', 'release-bundle-integrity',
      ...(mode === 'full' ? ['rust'] : []),
    ],
  },
  toolchain: {
    node: pin(/ARG NODE_VERSION=([^\n]+)/u, 'Node'),
    pnpm: String(manifest.packageManager).replace(/^pnpm@/u, ''),
    rust: pin(/default-toolchain ([0-9.]+)/u, 'Rust'),
    wasmBindgen: pin(/wasm-bindgen-cli --version ([0-9.]+)/u, 'wasm-bindgen'),
    typescript: manifest.devDependencies.typescript,
    vitest: manifest.devDependencies.vitest,
    playwright: manifest.devDependencies.playwright,
  },
  artifacts,
  wasm,
  attestation: {
    localSignature: false,
    releaseMechanism: 'GitHub Actions build-provenance attestation (OIDC) over published release assets',
  },
};
const target = resolve(root, 'dist/verification-record.json');
writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
console.log(`Created ${basename(target)} for ${artifacts.length} HTML artifacts and ${wasm.length} generated WASM files.`);
