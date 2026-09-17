import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const localTools = resolve(root, '.tools');
const sharedTools = resolve(root, '..', '.tools');
const tools = existsSync(resolve(localTools, 'cargo/bin/cargo')) ? localTools : sharedTools;
const cargoHome = resolve(tools, 'cargo');
const rustupHome = resolve(tools, 'rustup');
const cargo = existsSync(resolve(cargoHome, 'bin/cargo')) ? resolve(cargoHome, 'bin/cargo') : 'cargo';
const environment = {
  ...process.env,
  ...(existsSync(cargoHome) ? { CARGO_HOME: cargoHome } : {}),
  ...(existsSync(rustupHome) ? { RUSTUP_HOME: rustupHome } : {}),
};
for (const manifest of [
  'packages/dash-shielded-wasm/rust/Cargo.toml',
  'packages/recovery-shamir-wasm/rust/Cargo.toml',
  'packages/recovery-codex32-wasm/rust/Cargo.toml',
  'packages/recovery-sskr-wasm/rust/Cargo.toml',
  'packages/recovery-envelope-wasm/rust/Cargo.toml',
]) {
  const result = spawnSync(cargo, ['test', '--manifest-path', resolve(root, manifest), '--locked'], {
    cwd: root,
    env: environment,
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
