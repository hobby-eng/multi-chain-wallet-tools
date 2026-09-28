import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vendors the MnemoCode core from its public Git repository.
 *
 * The build itself never uses the network: this command is run deliberately,
 * writes reviewed source files plus a manifest of their SHA-256 values, and the
 * result is committed. `--check` verifies the committed files offline.
 *
 * Only the dependency-free transformation core is imported. MnemoCode's CLI,
 * SSKR bridge, QR reader, PDF renderers and WASM are never vendored, because the
 * Derivation Tool already provides its own SSKR, QR and BIP39 components.
 */

const defaultRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const MNEMOCODE_REPOSITORY = 'hobby-eng/mnemocode';
export const MNEMOCODE_SOURCE_DIRECTORY = 'packages/recovery-mnemocode/source';
export const MNEMOCODE_MANIFEST = 'packages/recovery-mnemocode/source.json';

/** Upstream path -> vendored path below MNEMOCODE_SOURCE_DIRECTORY. */
export const MNEMOCODE_FILES = Object.freeze({
  'src/core.ts': 'core.ts',
  'src/core/bits.ts': 'core/bits.ts',
  'src/core/colors.ts': 'core/colors.ts',
  'src/core/dates.ts': 'core/dates.ts',
  'src/core/representations.ts': 'core/representations.ts',
  'src/core/seedshift.ts': 'core/seedshift.ts',
  'src/core/types.ts': 'core/types.ts',
  'src/core/words.ts': 'core/words.ts',
  'src/record.ts': 'record.ts',
  LICENSE: 'LICENSE',
  NOTICE: 'NOTICE',
});

/** Every other module specifier would duplicate or add a dependency. */
const ALLOWED_PACKAGE_IMPORTS = new Set([
  '@scure/bip39',
  '@scure/bip39/wordlists/english.js',
  '@scure/bip39/wordlists/traditional-chinese.js',
]);
const SHARED_DEPENDENCY = '@scure/bip39';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Highest `vMAJOR.MINOR.PATCH` tag; pre-release and malformed tags are ignored. */
export function selectReleaseTag(lsRemoteOutput) {
  const tags = lsRemoteOutput
    .split('\n')
    .map((line) => /^([0-9a-f]{40})\trefs\/tags\/(v?(\d+)\.(\d+)\.(\d+))$/u.exec(line.trim()))
    .filter((match) => match !== null)
    .map((match) => ({
      commit: match[1],
      reference: match[2],
      version: [Number(match[3]), Number(match[4]), Number(match[5])],
    }));
  tags.sort(
    (left, right) =>
      right.version[0] - left.version[0] || right.version[1] - left.version[1] || right.version[2] - left.version[2],
  );
  return tags[0];
}

export function importedSpecifiers(source) {
  return [...source.matchAll(/\b(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gu)]
    .map((match) => match[1])
    .concat([...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu)].map((match) => match[1]))
    .concat([...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gmu)].map((match) => match[1]));
}

/** Rejects Node built-ins, other packages and paths that leave the vendored core. */
export function assertAllowedImports(vendoredPath, source) {
  const known = new Set(Object.values(MNEMOCODE_FILES));
  for (const specifier of importedSpecifiers(source)) {
    if (ALLOWED_PACKAGE_IMPORTS.has(specifier)) continue;
    if (!specifier.startsWith('.')) {
      throw new Error(
        `MnemoCode ${vendoredPath} imports ${specifier}. Only ${SHARED_DEPENDENCY} may be shared; ` +
          'no additional dependency may be introduced through the vendored core.',
      );
    }
    const target = relative('/', resolve('/', dirname(vendoredPath), specifier.replace(/\.js$/u, '.ts')));
    if (!known.has(target)) {
      throw new Error(`MnemoCode ${vendoredPath} imports ${specifier}, which is outside the vendored core.`);
    }
  }
}

function resolveUpstreamCommit(reference) {
  const url = `https://github.com/${MNEMOCODE_REPOSITORY}.git`;
  const git = (args) => execFileSync('git', ['ls-remote', ...args], { encoding: 'utf8', timeout: 60_000 }).trim();
  if (reference !== undefined) {
    if (/^[0-9a-f]{40}$/u.test(reference)) return { reference, commit: reference };
    const line = git([url, `refs/tags/${reference}`, `refs/heads/${reference}`]).split('\n')[0] ?? '';
    const commit = /^([0-9a-f]{40})\t/u.exec(line)?.[1];
    if (commit === undefined) throw new Error(`MnemoCode reference ${reference} was not found on GitHub.`);
    return { reference, commit };
  }
  const tag = selectReleaseTag(git(['--tags', '--refs', url]));
  if (tag !== undefined) return { reference: tag.reference, commit: tag.commit };
  const main = /^([0-9a-f]{40})\t/u.exec(git([url, 'refs/heads/main']))?.[1];
  if (main === undefined) throw new Error('MnemoCode has neither a release tag nor a main branch.');
  return { reference: 'main', commit: main };
}

async function download(commit, path, fetchImpl) {
  const url = `https://raw.githubusercontent.com/${MNEMOCODE_REPOSITORY}/${commit}/${path}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Could not download ${path} at ${commit}: HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}

function vendoredFiles(root) {
  const base = resolve(root, MNEMOCODE_SOURCE_DIRECTORY);
  if (!existsSync(base)) return [];
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(base, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .sort();
}

/** Offline gate: committed files, manifest hashes, import allowlist and shared dependency version. */
export function verifyMnemoCodeSource({ root = defaultRoot } = {}) {
  const manifest = JSON.parse(readFileSync(resolve(root, MNEMOCODE_MANIFEST), 'utf8'));
  if (manifest.repository !== MNEMOCODE_REPOSITORY) throw new Error('MnemoCode manifest names another repository.');
  if (!/^[0-9a-f]{40}$/u.test(manifest.commit ?? '')) {
    throw new Error('MnemoCode manifest must pin a full commit.');
  }
  const expected = Object.values(MNEMOCODE_FILES).sort();
  const listed = Object.keys(manifest.files ?? {}).sort();
  const present = vendoredFiles(root);
  if (JSON.stringify(listed) !== JSON.stringify(expected) || JSON.stringify(present) !== JSON.stringify(expected)) {
    throw new Error('The vendored MnemoCode core must contain exactly the reviewed file set.');
  }
  for (const path of expected) {
    const bytes = readFileSync(resolve(root, MNEMOCODE_SOURCE_DIRECTORY, path));
    if (sha256(bytes) !== manifest.files[path]) {
      throw new Error(`Vendored MnemoCode file ${path} does not match its pinned SHA-256.`);
    }
    if (path.endsWith('.ts')) assertAllowedImports(path, bytes.toString('utf8'));
  }
  const local = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).dependencies?.[SHARED_DEPENDENCY];
  if (local !== manifest.sharedDependencies?.[SHARED_DEPENDENCY]) {
    throw new Error(
      `MnemoCode was reviewed with ${SHARED_DEPENDENCY} ${manifest.sharedDependencies?.[SHARED_DEPENDENCY]}, ` +
        `but this project pins ${local}. Synchronize the versions before building.`,
    );
  }
  return manifest;
}

export async function syncMnemoCodeSource({ root = defaultRoot, reference, fetchImpl = fetch, logger = console } = {}) {
  const upstream = resolveUpstreamCommit(reference);
  const upstreamPackage = JSON.parse((await download(upstream.commit, 'package.json', fetchImpl)).toString('utf8'));
  const local = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).dependencies?.[SHARED_DEPENDENCY];
  const shared = upstreamPackage.dependencies?.[SHARED_DEPENDENCY];
  if (shared !== local) {
    throw new Error(
      `MnemoCode ${upstream.reference} uses ${SHARED_DEPENDENCY} ${shared}, but this project pins ${local}. ` +
        'The core is compiled against the local copy, so both versions must match.',
    );
  }
  const downloaded = [];
  for (const [upstreamPath, vendoredPath] of Object.entries(MNEMOCODE_FILES)) {
    const bytes = await download(upstream.commit, upstreamPath, fetchImpl);
    if (vendoredPath.endsWith('.ts')) assertAllowedImports(vendoredPath, bytes.toString('utf8'));
    downloaded.push({ upstreamPath, vendoredPath, bytes });
  }
  // Replace the directory only after every file was fetched and checked.
  const base = resolve(root, MNEMOCODE_SOURCE_DIRECTORY);
  rmSync(base, { recursive: true, force: true });
  const files = {};
  for (const { vendoredPath, bytes } of downloaded) {
    const target = resolve(base, vendoredPath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    files[vendoredPath] = sha256(bytes);
  }
  const manifest = {
    schemaVersion: 1,
    repository: MNEMOCODE_REPOSITORY,
    reference: upstream.reference,
    commit: upstream.commit,
    version: upstreamPackage.version,
    sharedDependencies: { [SHARED_DEPENDENCY]: shared },
    excluded: 'CLI, SSKR bridge and WASM, QR reader and writer, PDF and image export, fonts and artwork',
    files: Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))),
  };
  writeFileSync(resolve(root, MNEMOCODE_MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  verifyMnemoCodeSource({ root });
  logger.log(
    `Vendored MnemoCode ${manifest.version} core from ${upstream.reference} (${upstream.commit}): ` +
      `${Object.keys(files).length} files.`,
  );
  return manifest;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const manifest = verifyMnemoCodeSource();
    console.log(`Verified vendored MnemoCode ${manifest.version} core at ${manifest.reference} (${manifest.commit}).`);
  } else {
    const index = args.indexOf('--ref');
    const reference = index >= 0 ? args[index + 1] : undefined;
    if (index >= 0 && reference === undefined) throw new Error('--ref requires a tag, branch or full commit.');
    await syncMnemoCodeSource({ reference });
  }
}
