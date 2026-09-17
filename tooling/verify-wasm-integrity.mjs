import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WASM_MODULES } from './wasm-modules.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = resolve(root, 'tooling/wasm-canonical-manifest.json');

function filesBelow(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? filesBelow(path) : [path];
    })
    .sort();
}

function hashFiles(paths) {
  const hash = createHash('sha256');
  for (const path of paths) {
    const name = relative(root, path).replaceAll('\\', '/');
    const bytes = readFileSync(path);
    hash.update(`${name}\0${bytes.length}\0`);
    hash.update(bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function moduleRecord(module) {
  const packageRoot = resolve(root, 'packages', module.packageDirectory);
  const rustRoot = resolve(packageRoot, 'rust');
  const sourcePaths = [
    resolve(root, 'Dockerfile.reproducible'),
    resolve(root, module.buildScript),
    resolve(root, 'tooling/offline-wasm-declarations.mjs'),
    resolve(root, 'tooling/rust-toolchain.mjs'),
    ...filesBelow(rustRoot).filter((path) => !path.includes('/target/')),
  ];
  const generatedRoot = resolve(packageRoot, 'generated');
  if (!existsSync(generatedRoot)) throw new Error(`${module.label} generated directory is missing.`);
  const generated = Object.fromEntries(
    filesBelow(generatedRoot).map((path) => [
      relative(generatedRoot, path).replaceAll('\\', '/'),
      createHash('sha256').update(readFileSync(path)).digest('hex'),
    ]),
  );
  return { sourceSha256: hashFiles(sourcePaths), generated };
}

export function createWasmIntegrityManifest() {
  return {
    schemaVersion: 1,
    generator: 'Dockerfile.reproducible wasm-artifacts',
    modules: Object.fromEntries(WASM_MODULES.map((module) => [module.packageDirectory, moduleRecord(module)])),
  };
}

export function verifyWasmIntegrityManifest() {
  if (!existsSync(manifestPath)) {
    throw new Error('Canonical WASM integrity manifest is missing. Run pnpm build:reproducible:wasm.');
  }
  const expected = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const actual = createWasmIntegrityManifest();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      'Generated WASM or its build inputs differ from the canonical container record. Run pnpm build:reproducible:wasm; local WASM builds are development-only.',
    );
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    writeFileSync(manifestPath, `${JSON.stringify(createWasmIntegrityManifest(), null, 2)}\n`);
    console.log(`Recorded canonical generated-WASM integrity in ${relative(root, manifestPath)}.`);
  } else {
    verifyWasmIntegrityManifest();
    console.log(`Verified canonical generated-WASM bytes and source inputs for ${WASM_MODULES.length} modules.`);
  }
}
