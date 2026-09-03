import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const wasmOnly = process.argv.includes('--wasm');
const target = wasmOnly ? 'wasm-artifacts' : 'artifacts';
const image = `multi-chain-wallet-tools-reproducible:${String(manifest.version)}-${target}`;
const temporary = mkdtempSync(join(tmpdir(), 'multi-chain-wallet-tools-reproducible-'));
let container;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.capture === true ? 'utf8' : undefined,
    stdio: options.capture === true ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error !== undefined) {
    if (command === 'docker' && result.error.code === 'ENOENT') {
      throw new Error('Docker was not found. Install Docker Engine or Docker Desktop and ensure the docker command is on PATH.');
    }
    throw result.error;
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  return options.capture === true ? result.stdout.trim() : '';
}

try {
  run('docker', ['version']);
  run('docker', [
    'build',
    '--platform', 'linux/amd64',
    '--file', 'Dockerfile.reproducible',
    '--target', target,
    '--tag', image,
    '.',
  ]);
  container = run('docker', ['create', image], { capture: true });
  const source = wasmOnly ? '/generated/.' : '/dist/.';
  run('docker', ['cp', `${container}:${source}`, temporary]);

  if (wasmOnly) {
    const destination = resolve(root, 'packages/dash-shielded-wasm/generated');
    if (!existsSync(resolve(temporary, 'dash_shielded_wasm_bg.wasm'))) {
      throw new Error('The reproducible WASM image did not contain the expected generated module.');
    }
    rmSync(destination, { recursive: true, force: true });
    cpSync(temporary, destination, { recursive: true });
    console.log('Replaced the committed generated WASM inputs with the canonical container build.');
  } else {
    const destination = resolve(root, 'dist');
    if (!existsSync(resolve(temporary, 'release/SHA256SUMS'))) {
      throw new Error('The reproducible build did not contain the verified release bundle.');
    }
    rmSync(destination, { recursive: true, force: true });
    cpSync(temporary, destination, { recursive: true });
    console.log(readFileSync(resolve(destination, 'release/SHA256SUMS'), 'utf8').trim());
    console.log('Copied the canonical container build to dist/.');
  }
} finally {
  if (container !== undefined && container.length > 0) {
    spawnSync('docker', ['rm', '--force', container], { cwd: root, stdio: 'ignore' });
  }
  rmSync(temporary, { recursive: true, force: true });
}
