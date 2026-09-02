import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cargoHome = resolve(root, '.tools/cargo');
const rustupHome = resolve(root, '.tools/rustup');
const cargo = existsSync(resolve(cargoHome, 'bin/cargo')) ? resolve(cargoHome, 'bin/cargo') : 'cargo';
const environment = {
  ...process.env,
  ...(existsSync(cargoHome) ? { CARGO_HOME: cargoHome } : {}),
  ...(existsSync(rustupHome) ? { RUSTUP_HOME: rustupHome } : {}),
};
const result = spawnSync(cargo, [
  'test',
  '--manifest-path',
  resolve(root, 'packages/dash-shielded-wasm/rust/Cargo.toml'),
  '--locked',
], { cwd: root, env: environment, stdio: 'inherit' });
if (result.error !== undefined) throw result.error;
process.exit(result.status ?? 1);
