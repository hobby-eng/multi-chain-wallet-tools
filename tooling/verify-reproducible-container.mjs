import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const dockerfile = read('Dockerfile.reproducible');

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message);
}

requireMatch(
  dockerfile,
  /^FROM buildpack-deps:noble@sha256:[a-f0-9]{64} AS toolchain$/m,
  'The canonical base image must be pinned by an immutable SHA-256 digest.',
);
for (const expected of [
  'ARG NODE_VERSION=24.19.0',
  'ARG NODE_ARCHIVE_SHA256=14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647',
  'ARG RUSTUP_VERSION=1.29.1',
  'ARG RUSTUP_INIT_SHA256=dda7234360b7f578ca8b0ddcb80145646fa61a67c1720a5abc7051b35c9fcb71',
  'npm install --global pnpm@11.19.0',
  'cargo install wasm-bindgen-cli --version 0.2.100 --locked',
  'RUN --network=none pnpm verify',
  'diff --recursive --brief /tmp/committed-generated packages/dash-shielded-wasm/generated',
  'FROM scratch AS artifacts',
  'FROM scratch AS wasm-artifacts',
]) {
  if (!dockerfile.includes(expected)) throw new Error(`Missing canonical container assertion: ${expected}`);
}

for (const path of ['.github/workflows/ci.yml', '.github/workflows/full-wasm.yml', '.github/workflows/release.yml']) {
  const workflow = read(path);
  for (const expected of ['--platform linux/amd64', '--file Dockerfile.reproducible', '--target artifacts']) {
    if (!workflow.includes(expected)) throw new Error(`${path} does not use the canonical container setting: ${expected}`);
  }
}

const ignored = read('.dockerignore').split(/\r?\n/u);
for (const expected of ['.git', 'node_modules', '.pnpm-store', 'dist', '**/target']) {
  if (!ignored.includes(expected)) throw new Error(`.dockerignore must exclude ${expected}`);
}
if (ignored.includes('.github') || ignored.includes('.github/**')) {
  throw new Error('.dockerignore must include the GitHub workflows verified inside the canonical container.');
}

console.log('Canonical reproducible-container configuration verified.');
