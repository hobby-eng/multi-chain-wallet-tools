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
 * Two groups are imported: the transformation core, and the card renderers with
 * their font and artwork. MnemoCode's CLI, file output, SSKR engine and WASM, QR
 * reader and PNG coder are never vendored: the renderers receive those services
 * from the host through MnemoCode's platform interface, and the Derivation Tool
 * supplies them from components it already has.
 */

const defaultRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

export const MNEMOCODE_REPOSITORY = 'hobby-eng/mnemocode';
export const MNEMOCODE_SOURCE_DIRECTORY = 'packages/recovery-mnemocode/source';
export const MNEMOCODE_MANIFEST = 'packages/recovery-mnemocode/source.json';

/** Card renderers, used only by the optional mnemocode-cards feature. */
export const MNEMOCODE_CARD_FILES = Object.freeze({
  'src/cards.ts': 'cards.ts',
  ...Object.fromEntries(
    [
      'business-artwork',
      'business-cards',
      'business-designs',
      'business-layout',
      'business-render-primitives',
      'card-copy',
      'card-identities',
      'card-qr',
      'card-session',
      'card-settings',
      'collection-sheet',
      'color-math',
      'document-metadata',
      'glass-artwork',
      'glass-cards',
      'glass-layout',
      'material-artwork',
      'material-cards',
      'material-layout',
      'platform',
      'render',
      'sskr-content',
      'templates',
      'world-map',
      'world-map-data',
    ].map((name) => [`src/export/${name}.ts`, `export/${name}.ts`]),
  ),
  // Share text validation used by the renderers; the sharing engine is not imported.
  'src/sskr/bytewords-list.ts': 'sskr/bytewords-list.ts',
  'src/sskr/transport.ts': 'sskr/transport.ts',
  ...Object.fromEntries(
    [
      'fonts/DejaVuSans-NOTICE',
      'fonts/DejaVuSans-UI.ttf',
      // Notice for the public-domain map data behind world-map-data.ts.
      'maps/NOTICE',
      'images/business-architect-v1.png',
      'images/business-contact-v1.png',
      'images/business-curves-v1.png',
      'images/business-diagonal-v1.png',
      'images/business-estate-v1.png',
      'images/business-facets-v1.png',
      'images/business-glass-4in1.png',
      'images/business-glass-6in1.jpg',
      'images/business-glass-8in1.jpg',
      'images/business-it-v1.png',
      'images/material-enclosure.jpg',
      'images/material-kitchen.jpg',
      'images/material-switch.jpg',
      'images/material-tile.jpg',
      'images/material-vehicle.jpg',
    ].map((name) => [`assets/${name}`, `assets/${name}`]),
  ),
});

/** Upstream path -> vendored path below MNEMOCODE_SOURCE_DIRECTORY. */
export const MNEMOCODE_FILES = Object.freeze({
  ...MNEMOCODE_CARD_FILES,
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

/** Packages the vendored files are compiled against; each resolves to this project's own pin. */
const SHARED_DEPENDENCIES = Object.freeze(['@scure/bip39', 'pdf-lib', '@pdf-lib/fontkit']);
/** Every other module specifier would duplicate or add a dependency. */
const ALLOWED_PACKAGE_IMPORTS = new Set([
  '@scure/bip39',
  '@scure/bip39/wordlists/english.js',
  '@scure/bip39/wordlists/traditional-chinese.js',
  'pdf-lib',
  '@pdf-lib/fontkit',
]);

function sharedVersions(packageJson) {
  return Object.fromEntries(SHARED_DEPENDENCIES.map((name) => [name, packageJson.dependencies?.[name]]));
}

function assertSameSharedVersions(reviewed, local, label) {
  for (const name of SHARED_DEPENDENCIES) {
    if (reviewed?.[name] === undefined || reviewed[name] !== local[name]) {
      throw new Error(
        `${label} uses ${name} ${reviewed?.[name]}, but this project pins ${local[name]}. ` +
          'The vendored files are compiled against the local copy, so both versions must match.',
      );
    }
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Commit of every reference in `git ls-remote` output.
 *
 * An annotated or signed tag is listed twice: once with the identifier of the tag
 * itself and once, with the suffix `^{}`, with the commit it points to. The commit wins.
 */
export function referencedCommits(lsRemoteOutput) {
  const commits = new Map();
  for (const line of lsRemoteOutput.split('\n')) {
    const match = /^([0-9a-f]{40})\t(\S+?)(\^\{\})?$/u.exec(line.trim());
    if (match === null) continue;
    const [, identifier, reference, peeled] = match;
    if (peeled !== undefined || !commits.has(reference)) commits.set(reference, identifier);
  }
  return commits;
}

/** Highest `vMAJOR.MINOR.PATCH` tag; pre-release and malformed tags are ignored. */
export function selectReleaseTag(lsRemoteOutput) {
  const tags = [...referencedCommits(lsRemoteOutput)]
    .map(([reference, commit]) => ({ commit, match: /^refs\/tags\/(v?(\d+)\.(\d+)\.(\d+))$/u.exec(reference) }))
    .filter(({ match }) => match !== null)
    .map(({ commit, match }) => ({
      commit,
      reference: match[1],
      version: [Number(match[2]), Number(match[3]), Number(match[4])],
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
        `MnemoCode ${vendoredPath} imports ${specifier}. Only ${SHARED_DEPENDENCIES.join(', ')} may be shared; ` +
          'no additional dependency may be introduced through the vendored core.',
      );
    }
    const target = relative('/', resolve('/', dirname(vendoredPath), specifier.replace(/\.js$/u, '.ts')));
    if (!known.has(target)) {
      throw new Error(`MnemoCode ${vendoredPath} imports ${specifier}, which is outside the vendored core.`);
    }
  }
}

/**
 * A full commit identifier is accepted only when `main` contains it.
 *
 * GitHub serves the files of any commit in the network of a repository, including
 * commits that exist only in a fork. Asking for the difference to `main` tells them apart:
 * `main` is ahead of, or identical to, each of its own commits.
 */
export async function assertCommitOnMain(commit, fetchImpl) {
  const url = `https://api.github.com/repos/${MNEMOCODE_REPOSITORY}/compare/${commit}...main`;
  const response = await fetchImpl(url, {
    headers: { accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(`Commit ${commit} was not found in ${MNEMOCODE_REPOSITORY}: HTTP ${response.status}.`);
  const { status } = await response.json();
  if (status !== 'ahead' && status !== 'identical')
    throw new Error(`Commit ${commit} is not part of the main branch of ${MNEMOCODE_REPOSITORY}.`);
}

async function resolveUpstreamCommit(reference, fetchImpl) {
  const url = `https://github.com/${MNEMOCODE_REPOSITORY}.git`;
  const git = (args) => execFileSync('git', ['ls-remote', ...args], { encoding: 'utf8', timeout: 60_000 }).trim();
  if (reference !== undefined) {
    if (/^[0-9a-f]{40}$/u.test(reference)) {
      await assertCommitOnMain(reference, fetchImpl);
      return { reference, commit: reference };
    }
    const commits = referencedCommits(git([url, `refs/tags/${reference}`, `refs/heads/${reference}`]));
    const commit = commits.get(`refs/tags/${reference}`) ?? commits.get(`refs/heads/${reference}`);
    if (commit === undefined) throw new Error(`MnemoCode reference ${reference} was not found on GitHub.`);
    return { reference, commit };
  }
  const tag = selectReleaseTag(git(['--tags', url]));
  if (tag !== undefined) return { reference: tag.reference, commit: tag.commit };
  const main = referencedCommits(git([url, 'refs/heads/main'])).get('refs/heads/main');
  if (main === undefined) throw new Error('MnemoCode has neither a release tag nor a main branch.');
  return { reference: 'main', commit: main };
}

async function download(commit, path, fetchImpl) {
  const url = `https://raw.githubusercontent.com/${MNEMOCODE_REPOSITORY}/${commit}/${path}`;
  let failure;
  // A short retry covers transient connection failures; an HTTP error is final.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
    } catch (cause) {
      failure = cause;
      continue;
    }
    if (!response.ok) throw new Error(`Could not download ${path} at ${commit}: HTTP ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  }
  throw new Error(`Could not download ${path} at ${commit}.`, { cause: failure });
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
  assertSameSharedVersions(
    manifest.sharedDependencies,
    sharedVersions(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))),
    'The vendored MnemoCode revision',
  );
  return manifest;
}

export async function syncMnemoCodeSource({ root = defaultRoot, reference, fetchImpl = fetch, logger = console } = {}) {
  const upstream = await resolveUpstreamCommit(reference, fetchImpl);
  const upstreamPackage = JSON.parse((await download(upstream.commit, 'package.json', fetchImpl)).toString('utf8'));
  const shared = sharedVersions(upstreamPackage);
  assertSameSharedVersions(
    shared,
    sharedVersions(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))),
    `MnemoCode ${upstream.reference}`,
  );
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
    sharedDependencies: shared,
    excluded: 'CLI, file and image output, SSKR engine and WASM, QR reader and writer, PNG coder',
    files: Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right))),
  };
  writeFileSync(resolve(root, MNEMOCODE_MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  verifyMnemoCodeSource({ root });
  logger.log(
    `Vendored MnemoCode ${manifest.version} from ${upstream.reference} (${upstream.commit}): ` +
      `${Object.keys(files).length} files.`,
  );
  return manifest;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const manifest = verifyMnemoCodeSource();
    console.log(`Verified vendored MnemoCode ${manifest.version} at ${manifest.reference} (${manifest.commit}).`);
  } else {
    const index = args.indexOf('--ref');
    const reference = index >= 0 ? args[index + 1] : undefined;
    if (index >= 0 && reference === undefined) throw new Error('--ref requires a tag, branch or full commit.');
    await syncMnemoCodeSource({ reference });
  }
}
