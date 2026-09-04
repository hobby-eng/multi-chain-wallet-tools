import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const WASM_BINDGEN_CRATE_URL = 'https://crates.io/api/v1/crates/wasm-bindgen';
const NOTE_ENCRYPTION_REPOSITORY_URL = 'https://api.github.com/repos/dashpay/zcash_note_encryption';
const NOTE_ENCRYPTION_REVIEWED_PATHS = [
  'src/',
  'Cargo.toml',
  'Cargo.lock',
  'build.rs',
];

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

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      'user-agent': 'multi-chain-wallet-tools-upstream-check',
    },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}.`);
  return response.text();
}

async function fetchJson(fetchImpl, url) {
  try {
    return JSON.parse(await fetchText(fetchImpl, url));
  } catch (cause) {
    throw new Error(`Cannot parse upstream JSON from ${url}: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Cannot read ${label}.`);
  return value;
}

export async function fetchWasmBindgenMaxStableVersion(fetchImpl) {
  const metadata = await fetchJson(fetchImpl, WASM_BINDGEN_CRATE_URL);
  return requiredString(metadata?.crate?.max_stable_version, 'latest wasm-bindgen max_stable_version');
}

export function noteEncryptionChangeRequiresReview(compare) {
  if (compare.status !== 'ahead' || !Array.isArray(compare.files)) return true;
  if (compare.files.length >= 300) return true;
  return compare.files.some(({ filename }) => (
    typeof filename !== 'string'
    || NOTE_ENCRYPTION_REVIEWED_PATHS.some((path) => (
      path.endsWith('/') ? filename.startsWith(path) : filename === path
    ))
  ));
}

async function inspectNoteEncryption(fetchImpl, pinnedRevision) {
  const repository = await fetchJson(fetchImpl, NOTE_ENCRYPTION_REPOSITORY_URL);
  const defaultBranch = requiredString(repository?.default_branch, 'zcash_note_encryption default branch');
  const head = await fetchJson(
    fetchImpl,
    `${NOTE_ENCRYPTION_REPOSITORY_URL}/commits/${encodeURIComponent(defaultBranch)}`,
  );
  const headRevision = requiredString(head?.sha, 'zcash_note_encryption default-branch head');
  if (headRevision === pinnedRevision) {
    return { headRevision, current: true, detail: `${defaultBranch} head matches the audited pin` };
  }
  const compare = await fetchJson(
    fetchImpl,
    `${NOTE_ENCRYPTION_REPOSITORY_URL}/compare/${pinnedRevision}...${headRevision}`,
  );
  const requiresReview = noteEncryptionChangeRequiresReview(compare);
  return {
    headRevision,
    current: !requiresReview,
    detail: requiresReview
      ? `${defaultBranch} has changes in src/, Cargo.toml, Cargo.lock, or build.rs that require cryptographic review`
      : `${defaultBranch} differs only outside the reviewed code/dependency surface`,
  };
}

function assertSynchronized(label, left, right) {
  if (left !== right) throw new Error(`${label} pins disagree: ${left} != ${right}.`);
}

export async function collectUpstreamVersionChecks(root, fetchImpl = fetch) {
  const dockerfile = readFileSync(resolve(root, 'Dockerfile.reproducible'), 'utf8');
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const cargoManifest = readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.toml'), 'utf8');
  const cargoLock = readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.lock'), 'utf8');

  const node = capture(dockerfile, /^ARG NODE_VERSION=(\S+)$/mu, 'Node version');
  const pnpm = capture(String(manifest.packageManager), /^pnpm@(.+)$/u, 'pnpm version');
  const dockerPnpm = capture(dockerfile, /npm install --global pnpm@(\S+)/u, 'Docker pnpm version');
  const rust = capture(dockerfile, /--default-toolchain (\S+)/u, 'Rust version');
  const rustup = capture(dockerfile, /^ARG RUSTUP_VERSION=(\S+)$/mu, 'rustup version');
  const evo = requiredString(manifest.dependencies?.['@dashevo/evo-sdk'], 'pinned Evo SDK version');
  const orchard = capture(cargoManifest, /orchard = \{[^}]*tag = "([^"]+)"/u, 'Dash Orchard tag');
  const orchardCommit = capture(
    cargoLock,
    /git\+https:\/\/github\.com\/dashpay\/orchard\.git\?tag=[^#"]+#([a-f0-9]{40})/u,
    'Dash Orchard commit',
  );
  const noteEncryptionCommit = capture(
    cargoLock,
    /git\+https:\/\/github\.com\/dashpay\/zcash_note_encryption\?rev=[^#"]+#([a-f0-9]{40})/u,
    'Dash note-encryption commit',
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
    latestWasmBindgen,
    noteEncryption,
  ] = await Promise.all([
    fetchJson(fetchImpl, 'https://nodejs.org/dist/index.json'),
    fetchJson(fetchImpl, 'https://registry.npmjs.org/pnpm/latest'),
    fetchText(fetchImpl, 'https://static.rust-lang.org/dist/channel-rust-stable.toml'),
    fetchJson(fetchImpl, 'https://api.github.com/repos/rust-lang/rustup/tags?per_page=20'),
    fetchJson(fetchImpl, 'https://registry.npmjs.org/%40dashevo%2Fevo-sdk/latest'),
    fetchJson(fetchImpl, 'https://api.github.com/repos/dashpay/orchard/tags?per_page=100'),
    fetchWasmBindgenMaxStableVersion(fetchImpl),
    inspectNoteEncryption(fetchImpl, noteEncryptionCommit),
  ]);

  const latestNode = nodeReleases.find((release) => release.lts !== false)?.version?.replace(/^v/u, '');
  const latestRust = capture(rustChannel, /\[pkg\.rust\]\s+version = "(\d+\.\d+\.\d+)/u, 'stable Rust version');
  const latestRustup = rustupTags
    .filter((tag) => /^\d+\.\d+\.\d+$/u.test(tag.name))
    .sort((left, right) => compareVersions(right.name, left.name))[0];
  const latestOrchard = orchardTags
    .filter((tag) => /^dashified-\d+\.\d+\.\d+$/u.test(tag.name))
    .sort((left, right) => compareVersions(right.name, left.name))[0];

  const latestNodeVersion = requiredString(latestNode, 'latest Node LTS');
  const latestPnpm = requiredString(pnpmMetadata.version, 'latest pnpm');
  const latestRustupName = requiredString(latestRustup?.name, 'latest rustup');
  const latestEvo = requiredString(evoMetadata.version, 'latest Evo SDK');
  const latestOrchardName = requiredString(latestOrchard?.name, 'latest Dash Orchard tag');
  const latestOrchardCommit = requiredString(latestOrchard?.commit?.sha, 'latest Dash Orchard commit');

  return [
    { label: 'Node LTS', current: node, latest: latestNodeVersion, matches: node === latestNodeVersion },
    { label: 'pnpm', current: pnpm, latest: latestPnpm, matches: pnpm === latestPnpm },
    { label: 'Rust stable', current: rust, latest: latestRust, matches: rust === latestRust },
    { label: 'rustup', current: rustup, latest: latestRustupName, matches: rustup === latestRustupName },
    { label: 'Dash Evo SDK', current: evo, latest: latestEvo, matches: evo === latestEvo },
    { label: 'wasm-bindgen', current: wasmBindgen, latest: latestWasmBindgen, matches: wasmBindgen === latestWasmBindgen },
    { label: 'Dash Orchard tag', current: orchard, latest: latestOrchardName, matches: orchard === latestOrchardName },
    { label: 'Dash Orchard commit', current: orchardCommit, latest: latestOrchardCommit, matches: orchardCommit === latestOrchardCommit },
    {
      label: 'Dash note-encryption reviewed source',
      current: noteEncryptionCommit,
      latest: noteEncryption.headRevision,
      matches: noteEncryption.current,
      detail: noteEncryption.detail,
    },
  ];
}

export function renderUpstreamVersionReport(checks) {
  const updateRequired = checks.some(({ matches }) => !matches);
  const lines = [
    `# ${updateRequired ? 'Pinned upstream dependency review required' : 'Pinned upstream dependencies are current'}`,
    '',
    '| Dependency | Pinned | Latest upstream | Status |',
    '| --- | --- | --- | --- |',
    ...checks.map(({ label, current, latest, matches }) => (
      `| ${label} | \`${current}\` | \`${latest}\` | ${matches ? 'current' : '**review required**'} |`
    )),
    '',
    'The `dashpay/zcash_note_encryption` row compares the pinned revision with the dedicated repository default-branch head. '
      + 'A differing head triggers review only when the GitHub compare includes `src/`, `Cargo.toml`, `Cargo.lock`, or `build.rs`; '
      + 'documentation and CI-only commits do not create a cryptographic update alert. A response at GitHub\'s 300-file limit fails closed '
      + 'for review. This checker never updates cryptographic dependencies.',
  ];
  const noteDetail = checks.find(({ label }) => label === 'Dash note-encryption reviewed source')?.detail;
  if (noteDetail !== undefined) lines.push('', `Note-encryption comparison: ${noteDetail}.`);
  if (updateRequired) lines.push('', 'Pinned upstream changes require a reviewed dependency pull request.');
  return { updateRequired, report: `${lines.join('\n')}\n` };
}

export async function runUpstreamVersionCheck(root, fetchImpl = fetch, output = process.stdout) {
  try {
    const result = renderUpstreamVersionReport(await collectUpstreamVersionChecks(root, fetchImpl));
    output.write(result.report);
    return result.updateRequired ? 1 : 0;
  } catch (cause) {
    output.write([
      '# Pinned upstream dependency checker failed',
      '',
      '**Infrastructure/parser failure — this is not an update-available signal.**',
      '',
      cause instanceof Error ? cause.message : String(cause),
      '',
    ].join('\n'));
    return 2;
  }
}
