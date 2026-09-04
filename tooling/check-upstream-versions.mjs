import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dockerfile = readFileSync(resolve(root, 'Dockerfile.reproducible'), 'utf8');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const cargoManifest = readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.toml'), 'utf8');
const cargoLock = readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.lock'), 'utf8');

function capture(text, pattern, label) {
  const value = pattern.exec(text)?.[1];
  if (value === undefined) throw new Error(`Cannot read the pinned ${label}.`);
  return value;
}

function versionParts(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(value);
  if (match === null) throw new Error(`Cannot compare version: ${value}`);
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      'user-agent': 'multi-chain-wallet-tools-upstream-check',
    },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.text();
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

function assertSynchronized(label, left, right) {
  if (left !== right) throw new Error(`${label} pins disagree: ${left} != ${right}.`);
}

const node = capture(dockerfile, /^ARG NODE_VERSION=(\S+)$/mu, 'Node version');
const pnpm = capture(String(manifest.packageManager), /^pnpm@(.+)$/u, 'pnpm version');
const dockerPnpm = capture(dockerfile, /npm install --global pnpm@(\S+)/u, 'Docker pnpm version');
const rust = capture(dockerfile, /--default-toolchain (\S+)/u, 'Rust version');
const rustup = capture(dockerfile, /^ARG RUSTUP_VERSION=(\S+)$/mu, 'rustup version');
const evo = manifest.dependencies?.['@dashevo/evo-sdk'];
if (typeof evo !== 'string') throw new Error('Cannot read the pinned Evo SDK version.');
const orchard = capture(cargoManifest, /orchard = \{[^}]*tag = "([^"]+)"/u, 'Dash Orchard tag');
const orchardCommit = capture(
  cargoLock,
  /git\+https:\/\/github\.com\/dashpay\/orchard\.git\?tag=[^#"]+#([a-f0-9]{40})/u,
  'Dash Orchard commit',
);
const wasmBindgen = capture(cargoManifest, /wasm-bindgen = "=(\d+\.\d+\.\d+)"/u, 'wasm-bindgen version');
const dockerWasmBindgen = capture(
  dockerfile,
  /cargo install wasm-bindgen-cli --version (\S+)/u,
  'wasm-bindgen-cli version',
);

assertSynchronized('pnpm', pnpm, dockerPnpm);
assertSynchronized('wasm-bindgen/wasm-bindgen-cli', wasmBindgen, dockerWasmBindgen);

const [
  nodeReleases,
  pnpmMetadata,
  rustChannel,
  rustupTags,
  evoMetadata,
  orchardTags,
  wasmBindgenMetadata,
] = await Promise.all([
  fetchJson('https://nodejs.org/dist/index.json'),
  fetchJson('https://registry.npmjs.org/pnpm/latest'),
  fetchText('https://static.rust-lang.org/dist/channel-rust-stable.toml'),
  fetchJson('https://api.github.com/repos/rust-lang/rustup/tags?per_page=20'),
  fetchJson('https://registry.npmjs.org/%40dashevo%2Fevo-sdk/latest'),
  fetchJson('https://api.github.com/repos/dashpay/orchard/tags?per_page=100'),
  fetchJson('https://crates.io/api/v1/crates?page=1&per_page=1&q=wasm-bindgen'),
]);

const latestNode = nodeReleases.find((release) => release.lts !== false)?.version?.replace(/^v/u, '');
const latestRust = capture(rustChannel, /\[pkg\.rust\]\s+version = "(\d+\.\d+\.\d+)/u, 'stable Rust version');
const latestRustup = rustupTags
  .filter((tag) => /^\d+\.\d+\.\d+$/u.test(tag.name))
  .sort((left, right) => compareVersions(right.name, left.name))[0];
const latestOrchard = orchardTags
  .filter((tag) => /^dashified-\d+\.\d+\.\d+$/u.test(tag.name))
  .sort((left, right) => compareVersions(right.name, left.name))[0];
const latestWasmBindgen = wasmBindgenMetadata.crates
  ?.find((crate) => crate.id === 'wasm-bindgen')
  ?.max_stable_version;

for (const [label, value] of [
  ['latest Node LTS', latestNode],
  ['latest pnpm', pnpmMetadata.version],
  ['latest rustup', latestRustup?.name],
  ['latest Evo SDK', evoMetadata.version],
  ['latest Dash Orchard tag', latestOrchard?.name],
  ['latest wasm-bindgen', latestWasmBindgen],
]) {
  if (typeof value !== 'string') throw new Error(`Cannot read ${label}.`);
}

const checks = [
  ['Node LTS', node, latestNode],
  ['pnpm', pnpm, pnpmMetadata.version],
  ['Rust stable', rust, latestRust],
  ['rustup', rustup, latestRustup.name],
  ['Dash Evo SDK', evo, evoMetadata.version],
  ['wasm-bindgen', wasmBindgen, latestWasmBindgen],
  ['Dash Orchard tag', orchard, latestOrchard.name],
  ['Dash Orchard commit', orchardCommit, latestOrchard.commit.sha],
];

console.log('| Dependency | Pinned | Latest upstream | Status |');
console.log('| --- | --- | --- | --- |');
let outdated = false;
for (const [label, current, latest] of checks) {
  const currentIsLatest = current === latest;
  outdated ||= !currentIsLatest;
  console.log(`| ${label} | \`${current}\` | \`${latest}\` | ${currentIsLatest ? 'current' : '**review update**'} |`);
}

if (outdated) {
  console.error('\nPinned upstream updates require a reviewed dependency pull request.');
  process.exitCode = 1;
}
