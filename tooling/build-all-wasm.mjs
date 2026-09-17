import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WASM_MODULES } from './wasm-modules.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const { buildScript: script } of WASM_MODULES) {
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
