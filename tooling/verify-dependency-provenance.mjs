import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MNEMOCODE_FILES,
  MNEMOCODE_MANIFEST,
  MNEMOCODE_SOURCE_DIRECTORY,
  verifyMnemoCodeSource,
} from './sync-mnemocode-source.mjs';

const defaultRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

// The MnemoCode pin is written by tooling/sync-mnemocode-source.mjs together with the vendored files.
const mnemocodeManifest = JSON.parse(readFileSync(resolve(defaultRoot, MNEMOCODE_MANIFEST), 'utf8'));

const GITHUB_SOURCES = [
  {
    id: 'mnemocode-core',
    repository: mnemocodeManifest.repository,
    reference: `${mnemocodeManifest.version} core, ${mnemocodeManifest.reference}`,
    commit: mnemocodeManifest.commit,
  },
  {
    id: 'dash-orchard',
    repository: 'dashpay/orchard',
    reference: 'dashified-0.14.1',
    commit: '38ac9c19a2df7bf3eeadc22ab23053e8fd538828',
  },
  {
    id: 'dash-zcash-note-encryption',
    repository: 'dashpay/zcash_note_encryption',
    reference: '9f7e93d',
    commit: '9f7e93d42cef839d02b9d75918117941d453f8cb',
  },
  {
    id: 'rust-codex32-0.1.0',
    repository: 'apoelstra/rust-codex32',
    reference: 'crates.io 0.1.0 VCS revision',
    commit: '305a5b3c1adaae7c3c35492d33946954213f16c7',
  },
  {
    id: 'slip39-reference',
    repository: 'trezor/python-shamir-mnemonic',
    reference: 'source revision used by the local port and official vectors',
    commit: '17fcce14736afe498871d3018e4fa9330443471a',
  },
  {
    id: 'seedsigner-seedqr',
    repository: 'SeedSigner/seedsigner',
    reference: 'SeedQR documentation revision',
    commit: 'b225ae77e9251a813cf2bd61e7874629d6f3cb10',
  },
  {
    // MHFE 0.4.0 is not released yet. The browser package is taken from the reproducible Docker
    // build (scripts/build-reproducible.sh) of this exact commit of the suite-3-c-engine branch.
    // Replace it with the release tag once 0.4.0 is published.
    id: 'mhfe-v0.4.0-draft',
    repository: 'hobby-eng/mhfe',
    reference: 'suite-3-c-engine draft of version 0.4.0, browser package (unreleased)',
    commit: '5dd7a7168aed51bb478f031dc934d07e04078a42',
  },
  {
    id: 'sskr-0.12.0',
    repository: 'BlockchainCommons/bc-sskr-rust',
    reference: 'crates.io 0.12.0 VCS revision',
    commit: '177cd9305c152b6cc1b9768651e65e7d563b4e8e',
  },
  {
    id: 'bc-envelope-0.43.0',
    repository: 'BlockchainCommons/bc-envelope-rust',
    reference: 'crates.io 0.43.0 VCS revision',
    commit: 'bae6880035bcd14c0d149d4eb42082b0069edb83',
  },
  {
    id: 'bc-components-0.31.1',
    repository: 'BlockchainCommons/bc-components-rust',
    reference: 'crates.io 0.31.1 VCS revision',
    commit: 'd843f5d8f66330eaa4471662d57f5c1bebfd0c7c',
  },
];

const LOCAL_IMPLEMENTATIONS = [
  {
    id: 'seedqr-codec',
    upstream: 'seedsigner-seedqr',
    files: ['packages/recovery-backup/src/seedqr.ts', 'packages/recovery-backup/tests/seedqr.test.ts'],
  },
  {
    id: 'mnemocode-codec',
    upstream: 'mnemocode-core',
    files: [
      MNEMOCODE_MANIFEST,
      ...Object.values(MNEMOCODE_FILES).map((path) => `${MNEMOCODE_SOURCE_DIRECTORY}/${path}`),
      'packages/recovery-backup/src/mnemocode.ts',
      'packages/recovery-backup/src/self-test-mnemocode.ts',
      'packages/recovery-backup/tests/mnemocode.test.ts',
      'apps/key-derivation/src/ui/recovery-mnemocode.ts',
      'apps/key-derivation/src/ui/recovery-mnemocode-help.ts',
      'packages/recovery-backup/src/mnemocode-cards.ts',
      'packages/recovery-backup/src/mnemocode-card-drawing.ts',
      'packages/recovery-backup/src/mnemocode-card-assets.ts',
      'packages/recovery-backup/tests/mnemocode-cards.test.ts',
      'packages/recovery-backup/tests/mnemocode-card-drawing.test.ts',
      'apps/key-derivation/src/ui/recovery-mnemocode-cards.ts',
      'apps/key-derivation/src/ui/recovery-mnemocode-card-images.ts',
    ],
  },
  {
    id: 'mhfe-browser-module',
    upstream: 'mhfe-v0.4.0-draft',
    files: [
      'packages/recovery-mhfe-wasm/generated/client.js',
      'packages/recovery-mhfe-wasm/generated/client.d.ts',
      'packages/recovery-mhfe-wasm/generated/mhfe-worker.js',
      'packages/recovery-mhfe-wasm/generated/mhfe_core_bg.wasm',
      'packages/recovery-mhfe-wasm/generated/argon2-mt.js',
      'packages/recovery-mhfe-wasm/generated/argon2-st.js',
      'packages/recovery-mhfe-wasm/generated/mhfe-fast-mode.py',
      'apps/key-derivation/src/ui/recovery-mhfe.ts',
    ],
  },
  {
    id: 'slip39-codec',
    upstream: 'slip39-reference',
    files: [
      'packages/recovery-backup/src/slip39.ts',
      'packages/recovery-backup/src/slip39-wordlist.ts',
      'packages/recovery-backup/tests/slip39-official-vectors.json',
      'packages/recovery-backup/tests/slip39.test.ts',
    ],
  },
  {
    id: 'codex32-codec',
    upstream: 'rust-codex32-0.1.0',
    files: [
      'packages/recovery-codex32-wasm/rust/src/lib.rs',
      'packages/recovery-backup/src/codex32.ts',
      'packages/recovery-backup/tests/codex32.test.ts',
      'packages/recovery-backup/tests/fixtures/bip93-vectors.json',
    ],
  },
  {
    id: 'sskr-codec',
    upstream: 'sskr-0.12.0',
    files: [
      'packages/recovery-sskr-wasm/rust/src/lib.rs',
      'packages/recovery-backup/src/sskr.ts',
      'packages/recovery-backup/src/self-test-sskr.ts',
    ],
  },
  {
    id: 'gordian-seed-envelope',
    upstream: 'bc-envelope-0.43.0',
    files: [
      'packages/recovery-envelope-wasm/rust/src/lib.rs',
      'packages/recovery-backup/src/gordian-envelope.ts',
      'packages/recovery-backup/src/self-test-gordian-envelope.ts',
    ],
  },
  {
    id: 'qr-render-and-decode',
    upstream: null,
    files: [
      'packages/shared-ui/src/payment-qr.ts',
      'packages/shared-ui/src/qr-image-import.ts',
      'packages/shared-ui/src/qr-image-import.test.ts',
    ],
  },
];

const FIXED_SOURCE_HASHES = Object.freeze({
  'packages/recovery-mhfe-wasm/generated/client.js': '9586fb55165731c08fc92595e3e048c6fd8f4d1a0ecf51725062b68b549aec56',
  'packages/recovery-mhfe-wasm/generated/client.d.ts':
    'ec8df6e43eff62987f2c893960175296165e85cf84636efb5df2cab6aaff4a6c',
  'packages/recovery-mhfe-wasm/generated/mhfe-worker.js':
    '0ef6562d98cd33e99df8a13955b1f970c9772420b4b0d0b96b2e3ea0b95cc2b9',
  'packages/recovery-mhfe-wasm/generated/mhfe_core_bg.wasm':
    'd293c4297f3df368e0fc2e1bfa96e9c8317f6ff8411edb25140e741bda23fd02',
  'packages/recovery-mhfe-wasm/generated/argon2-mt.js':
    'f98906c851a986df514d22536bb48a09724a0fa0b49079860b9a0ef00806f521',
  'packages/recovery-mhfe-wasm/generated/argon2-st.js':
    '63ece7b314daf8a06ebadb0ff7acdf8be886ddfc9660b5ad13577536c4a3f6da',
  'packages/recovery-mhfe-wasm/generated/mhfe-fast-mode.py':
    'fb9ba8bc863b3310cb80b37383a5ac260e2b3ae20601ffce5bfc3e0ba8906788',
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function packageBlocks(lockfile) {
  const start = lockfile.indexOf('\npackages:\n');
  const end = lockfile.indexOf('\nsnapshots:\n', start);
  if (start < 0 || end < 0) throw new Error('pnpm-lock.yaml is missing packages or snapshots.');
  const section = lockfile.slice(start + '\npackages:\n'.length, end);
  return [...section.matchAll(/^  (\S[^\n]*):\n([\s\S]*?)(?=^  \S[^\n]*:\n|\s*$)/gmu)];
}

export function verifyPnpmLock(lockfile) {
  const blocks = packageBlocks(lockfile);
  if (blocks.length === 0) throw new Error('pnpm-lock.yaml contains no external packages.');
  for (const [, name, body] of blocks) {
    if (!/resolution: \{integrity: sha512-[A-Za-z0-9+/]+={0,2}\}/u.test(body)) {
      throw new Error('pnpm dependency is missing a pinned SHA-512 integrity value: ' + name);
    }
  }
  return blocks.length;
}

export function verifyCargoLock(lockfile, label) {
  const blocks = lockfile
    .split(/^\[\[package\]\]\s*$/mu)
    .slice(1)
    .map((body) => [undefined, body]);
  let external = 0;
  for (const [, body] of blocks) {
    const name = /^name = "([^"]+)"/mu.exec(body)?.[1] ?? 'unknown';
    const source = /^source = "([^"]+)"/mu.exec(body)?.[1];
    if (source === undefined) continue;
    external += 1;
    if (source.startsWith('registry+')) {
      if (!/^checksum = "[a-f0-9]{64}"$/mu.test(body))
        throw new Error(label + ' registry crate is missing its SHA-256 checksum: ' + name);
    } else if (source.startsWith('git+')) {
      if (!/#[a-f0-9]{40}$/u.test(source))
        throw new Error(label + ' git crate is not pinned to a full commit: ' + name);
    } else {
      throw new Error(label + ' uses an unsupported external Cargo source: ' + source);
    }
  }
  if (external === 0) throw new Error(label + ' contains no external Cargo packages.');
  return external;
}

async function checkGithubSource(source, fetchImpl, timeoutMs) {
  const url = 'https://api.github.com/repos/' + source.repository + '/commits/' + source.commit;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ckd-provenance-check' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { ...source, status: 'unavailable', detail: 'GitHub returned HTTP ' + response.status };
    const payload = await response.json();
    if (payload.sha !== source.commit) {
      throw new Error(
        'GitHub provenance mismatch for ' +
          source.id +
          ': expected ' +
          source.commit +
          ', received ' +
          String(payload.sha),
      );
    }
    return { ...source, status: 'verified', detail: 'Exact commit is available from GitHub.' };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GitHub provenance mismatch')) throw error;
    return { ...source, status: 'unavailable', detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function verifyDependencyProvenance({
  root = defaultRoot,
  fetchImpl = fetch,
  timeoutMs = 5000,
  writeReport = true,
  verifyFixedSources = true,
  logger = console,
} = {}) {
  if (verifyFixedSources) {
    verifyMnemoCodeSource({ root });
    for (const [path, expected] of Object.entries(FIXED_SOURCE_HASHES)) {
      const actual = sha256(readFileSync(resolve(root, path)));
      if (actual !== expected)
        throw new Error(`Pinned source checksum mismatch for ${path}: expected ${expected}, got ${actual}.`);
    }
  }
  const pnpmPackages = verifyPnpmLock(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8'));
  const cargoLockPaths = [
    'packages/dash-shielded-wasm/rust/Cargo.lock',
    'packages/recovery-codex32-wasm/rust/Cargo.lock',
    'packages/recovery-sskr-wasm/rust/Cargo.lock',
    'packages/recovery-envelope-wasm/rust/Cargo.lock',
    'apps/key-derivation/launcher/Cargo.lock',
  ];
  const cargoPackages = cargoLockPaths.reduce(
    (count, path) => count + verifyCargoLock(readFileSync(resolve(root, path), 'utf8'), path),
    0,
  );
  const localSources = LOCAL_IMPLEMENTATIONS.map((entry) => ({
    ...entry,
    files: entry.files.map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) })),
  }));
  const github = await Promise.all(GITHUB_SOURCES.map((source) => checkGithubSource(source, fetchImpl, timeoutMs)));
  for (const result of github) {
    if (result.status === 'unavailable') {
      logger.warn(
        'WARNING: upstream commit availability verification was unavailable for ' +
          result.id +
          ' (' +
          result.commit +
          '): ' +
          result.detail +
          '. Package-manager integrity pins remain mandatory, and local source hashes are recorded in the verification evidence.',
      );
    }
  }
  const report = {
    schemaVersion: 1,
    lockedDependencies: {
      pnpmPackages,
      cargoPackages,
      policy:
        'Every pnpm archive has a SHA-512 integrity pin; every crates.io archive has a SHA-256 checksum; every Cargo git source has a full commit pin.',
    },
    github,
    localSources,
  };
  if (writeReport) {
    const target = resolve(root, 'dist/dependency-provenance.json');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
  }
  logger.log(
    'Validated package-manager integrity pins for ' +
      pnpmPackages +
      ' pnpm packages and ' +
      cargoPackages +
      ' Cargo packages; GitHub exact commits verified ' +
      github.filter((item) => item.status === 'verified').length +
      '/' +
      github.length +
      '.',
  );
  return report;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyDependencyProvenance();
}
