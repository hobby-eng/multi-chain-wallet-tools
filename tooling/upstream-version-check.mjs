import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const WASM_BINDGEN_CRATE_URL = 'https://crates.io/api/v1/crates/wasm-bindgen';
const NOTE_ENCRYPTION_REPOSITORY_URL = 'https://api.github.com/repos/dashpay/zcash_note_encryption';
const NOTE_ENCRYPTION_REVIEWED_PATHS = ['src/', 'Cargo.toml', 'Cargo.lock', 'build.rs'];
const CRATES_API = 'https://crates.io/api/v1/crates';
const NPM_REGISTRY = 'https://registry.npmjs.org';

const SOURCE_REPOSITORIES = {
  slip39: 'trezor/python-shamir-mnemonic',
  seedqr: 'SeedSigner/seedsigner',
};

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
    throw new Error(
      `Cannot parse upstream JSON from ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function requiredString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Cannot read ${label}.`);
  return value;
}

async function fetchCrateVersion(fetchImpl, crate) {
  const metadata = await fetchJson(fetchImpl, `${CRATES_API}/${encodeURIComponent(crate)}`);
  return requiredString(metadata?.crate?.max_stable_version, `latest ${crate} max_stable_version`);
}

async function fetchNpmVersion(fetchImpl, packageName) {
  const metadata = await fetchJson(fetchImpl, `${NPM_REGISTRY}/${encodeURIComponent(packageName)}/latest`);
  return requiredString(metadata?.version, `latest ${packageName} version`);
}

async function fetchRepositoryHead(fetchImpl, repository) {
  const base = `https://api.github.com/repos/${repository}`;
  const metadata = await fetchJson(fetchImpl, base);
  const branch = requiredString(metadata?.default_branch, `${repository} default branch`);
  const commit = await fetchJson(fetchImpl, `${base}/commits/${encodeURIComponent(branch)}`);
  return {
    branch,
    revision: requiredString(commit?.sha, `${repository} ${branch} head`),
  };
}

function pinnedSourceCommit(provenanceSource, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return capture(
    provenanceSource,
    new RegExp(`id: '${escaped}'[\\s\\S]*?commit: '([a-f0-9]{40})'`, 'u'),
    `${id} source commit`,
  );
}

export async function fetchWasmBindgenMaxStableVersion(fetchImpl) {
  const metadata = await fetchJson(fetchImpl, WASM_BINDGEN_CRATE_URL);
  return requiredString(metadata?.crate?.max_stable_version, 'latest wasm-bindgen max_stable_version');
}

export function noteEncryptionChangeRequiresReview(compare) {
  if (compare.status !== 'ahead' || !Array.isArray(compare.files)) return true;
  if (compare.files.length >= 300) return true;
  return compare.files.some(
    ({ filename }) =>
      typeof filename !== 'string' ||
      NOTE_ENCRYPTION_REVIEWED_PATHS.some((path) =>
        path.endsWith('/') ? filename.startsWith(path) : filename === path,
      ),
  );
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

async function collectUpstreamVersionChecks(root, fetchImpl = fetch) {
  const dockerfile = readFileSync(resolve(root, 'Dockerfile.reproducible'), 'utf8');
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const cargoManifest = readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.toml'), 'utf8');
  const cargoLock = readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.lock'), 'utf8');
  const shamirManifest = readFileSync(resolve(root, 'packages/recovery-shamir-wasm/rust/Cargo.toml'), 'utf8');
  const codex32Manifest = readFileSync(resolve(root, 'packages/recovery-codex32-wasm/rust/Cargo.toml'), 'utf8');
  const sskrManifest = readFileSync(resolve(root, 'packages/recovery-sskr-wasm/rust/Cargo.toml'), 'utf8');
  const envelopeManifest = readFileSync(resolve(root, 'packages/recovery-envelope-wasm/rust/Cargo.toml'), 'utf8');
  const provenanceSource = readFileSync(resolve(root, 'tooling/verify-dependency-provenance.mjs'), 'utf8');

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
  const blahaj = capture(
    shamirManifest,
    /sharks = \{ package = "blahaj", version = "=(\d+\.\d+\.\d+)"/u,
    'blahaj version',
  );
  const codex32 = capture(codex32Manifest, /codex32 = "=(\d+\.\d+\.\d+)"/u, 'Codex32 version');
  const sskr = capture(sskrManifest, /sskr = "=(\d+\.\d+\.\d+)"/u, 'SSKR version');
  const envelope = capture(
    envelopeManifest,
    /bc-envelope = \{ version = "=(\d+\.\d+\.\d+)"/u,
    'Gordian Envelope version',
  );
  const components = capture(
    envelopeManifest,
    /bc-components = \{ version = "=(\d+\.\d+\.\d+)"/u,
    'Blockchain Commons components version',
  );
  const qr = requiredString(manifest.dependencies?.qr, 'pinned qr version');
  const uqr = requiredString(manifest.dependencies?.uqr, 'pinned uqr version');
  const playwright = requiredString(manifest.devDependencies?.playwright, 'pinned Playwright version');
  const slip39Commit = pinnedSourceCommit(provenanceSource, 'slip39-reference');
  const seedqrCommit = pinnedSourceCommit(provenanceSource, 'seedsigner-seedqr');
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
    latestBlahaj,
    latestCodex32,
    latestSskr,
    latestEnvelope,
    latestComponents,
    latestQr,
    latestUqr,
    latestPlaywright,
    slip39Head,
    seedqrHead,
  ] = await Promise.all([
    fetchJson(fetchImpl, 'https://nodejs.org/dist/index.json'),
    fetchJson(fetchImpl, 'https://registry.npmjs.org/pnpm/latest'),
    fetchText(fetchImpl, 'https://static.rust-lang.org/dist/channel-rust-stable.toml'),
    fetchJson(fetchImpl, 'https://api.github.com/repos/rust-lang/rustup/tags?per_page=20'),
    fetchJson(fetchImpl, 'https://registry.npmjs.org/%40dashevo%2Fevo-sdk/latest'),
    fetchJson(fetchImpl, 'https://api.github.com/repos/dashpay/orchard/tags?per_page=100'),
    fetchWasmBindgenMaxStableVersion(fetchImpl),
    inspectNoteEncryption(fetchImpl, noteEncryptionCommit),
    fetchCrateVersion(fetchImpl, 'blahaj'),
    fetchCrateVersion(fetchImpl, 'codex32'),
    fetchCrateVersion(fetchImpl, 'sskr'),
    fetchCrateVersion(fetchImpl, 'bc-envelope'),
    fetchCrateVersion(fetchImpl, 'bc-components'),
    fetchNpmVersion(fetchImpl, 'qr'),
    fetchNpmVersion(fetchImpl, 'uqr'),
    fetchNpmVersion(fetchImpl, 'playwright'),
    fetchRepositoryHead(fetchImpl, SOURCE_REPOSITORIES.slip39),
    fetchRepositoryHead(fetchImpl, SOURCE_REPOSITORIES.seedqr),
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
    {
      label: 'wasm-bindgen',
      current: wasmBindgen,
      latest: latestWasmBindgen,
      matches: wasmBindgen === latestWasmBindgen,
    },
    { label: 'Dash Orchard tag', current: orchard, latest: latestOrchardName, matches: orchard === latestOrchardName },
    {
      label: 'Dash Orchard commit',
      current: orchardCommit,
      latest: latestOrchardCommit,
      matches: orchardCommit === latestOrchardCommit,
    },
    {
      label: 'Dash note-encryption reviewed source',
      current: noteEncryptionCommit,
      latest: noteEncryption.headRevision,
      matches: noteEncryption.current,
      detail: noteEncryption.detail,
    },
    {
      label: '[blahaj](https://git.distrust.co/public/blahaj)',
      current: blahaj,
      latest: latestBlahaj,
      matches: blahaj === latestBlahaj,
    },
    {
      label: '[Codex32](https://github.com/apoelstra/rust-codex32)',
      current: codex32,
      latest: latestCodex32,
      matches: codex32 === latestCodex32,
    },
    {
      label: '[SSKR](https://github.com/BlockchainCommons/bc-sskr-rust)',
      current: sskr,
      latest: latestSskr,
      matches: sskr === latestSskr,
    },
    {
      label: '[Gordian Envelope](https://github.com/BlockchainCommons/bc-envelope-rust)',
      current: envelope,
      latest: latestEnvelope,
      matches: envelope === latestEnvelope,
    },
    {
      label: '[Blockchain Commons components](https://github.com/BlockchainCommons/bc-components-rust)',
      current: components,
      latest: latestComponents,
      matches: components === latestComponents,
    },
    {
      label: '[qr](https://github.com/paulmillr/qr)',
      current: qr,
      latest: latestQr,
      matches: qr === latestQr,
    },
    {
      label: '[uqr](https://github.com/unjs/uqr)',
      current: uqr,
      latest: latestUqr,
      matches: uqr === latestUqr,
    },
    {
      label: '[Playwright](https://github.com/microsoft/playwright)',
      current: playwright,
      latest: latestPlaywright,
      matches: playwright === latestPlaywright,
    },
    {
      label: '[SLIP-39 reference source](https://github.com/trezor/python-shamir-mnemonic)',
      current: slip39Commit,
      latest: slip39Head.revision,
      matches: slip39Commit === slip39Head.revision,
      detail: `${slip39Head.branch} head`,
    },
    {
      label: '[SeedSigner SeedQR source](https://github.com/SeedSigner/seedsigner)',
      current: seedqrCommit,
      latest: seedqrHead.revision,
      matches: seedqrCommit === seedqrHead.revision,
      detail: `${seedqrHead.branch} head`,
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
    ...checks.map(
      ({ label, current, latest, matches }) =>
        `| ${label} | \`${current}\` | \`${latest}\` | ${matches ? 'current' : '**review required**'} |`,
    ),
    '',
    'Package rows compare exact local pins with their registries; source rows compare the reviewed commit with the repository default-branch head.',
    '',
    'The `dashpay/zcash_note_encryption` row compares the pinned revision with the dedicated repository default-branch head. ' +
      'A differing head triggers review only when the GitHub compare includes `src/`, `Cargo.toml`, `Cargo.lock`, or `build.rs`; ' +
      "documentation and CI-only commits do not create a cryptographic update alert. A response at GitHub's 300-file limit fails closed " +
      'for review. This checker never updates cryptographic dependencies.',
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
    output.write(
      [
        '# Pinned upstream dependency checker failed',
        '',
        '**Infrastructure/parser failure — this is not an update-available signal.**',
        '',
        cause instanceof Error ? cause.message : String(cause),
        '',
      ].join('\n'),
    );
    return 2;
  }
}
