import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readReleaseMetadata } from './project-metadata.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const release = readReleaseMetadata(root);
const changes = new Map();

function stage(relativePath, transform) {
  const path = resolve(root, relativePath);
  const before = readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) return;
  changes.set(relativePath, after);
}

function replaceRequired(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`Cannot synchronize ${label}: expected marker is missing.`);
  return text.replace(pattern, replacement);
}

for (const workspaceRoot of ['apps', 'packages']) {
  for (const entry of readdirSync(resolve(root, workspaceRoot), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const relativePath = `${workspaceRoot}/${entry.name}/package.json`;
    try {
      stage(relativePath, (text) => {
        const manifest = JSON.parse(text);
        manifest.version = release.version;
        return `${JSON.stringify(manifest, null, 2)}\n`;
      });
    } catch (cause) {
      if (cause?.code !== 'ENOENT') throw cause;
    }
  }
}

stage('packages/dash-shielded-wasm/rust/Cargo.toml', (text) =>
  replaceRequired(text, /^(\[package\]\nname = "dash-shielded-wasm"\nversion = ")[^"]+(")/mu, `$1${release.version}$2`, 'Rust package version'));
stage('packages/dash-shielded-wasm/rust/Cargo.lock', (text) =>
  replaceRequired(text, /(\[\[package\]\]\nname = "dash-shielded-wasm"\nversion = ")[^"]+(")/u, `$1${release.version}$2`, 'Rust lock version'));
stage('THIRD_PARTY_NOTICES.md', (text) =>
  replaceRequired(text, /^(dash-shielded-wasm\s+)[0-9]+\.[0-9]+\.[0-9]+(\s+)/mu, `$1${release.version}$2`, 'Rust notice version'));
// Audit dates, reviewed commits and evidence records are not release metadata.

const releaseNotes = `docs/releases/${release.tag}.md`;
stage(releaseNotes, (text) => {
  let next = replaceRequired(text, /^# Multi-Chain Wallet Tools v[0-9]+\.[0-9]+\.[0-9]+$/mu,
    `# Multi-Chain Wallet Tools ${release.tag}`, 'release-note title');
  next = replaceRequired(next, /carry version [0-9]+\.[0-9]+\.[0-9]+\./u,
    `carry version ${release.version}.`, 'release-note version');
  return next;
});

if (changes.size === 0) {
  console.log(`Project metadata is synchronized at ${release.tag} (${release.releaseDate}).`);
} else if (checkOnly) {
  throw new Error(`Project metadata is out of sync with package.json: ${[...changes.keys()].join(', ')}. Run pnpm metadata:sync.`);
} else {
  for (const [relativePath, text] of changes) writeFileSync(resolve(root, relativePath), text);
  console.log(`Synchronized ${changes.size} file(s) to ${release.tag} (${release.releaseDate}).`);
}
