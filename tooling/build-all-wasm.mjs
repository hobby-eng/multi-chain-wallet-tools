import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
for (const script of [
  'tooling/build-shielded-wasm.mjs',
  'tooling/build-recovery-shamir-wasm.mjs',
  'tooling/build-recovery-codex32-wasm.mjs',
]) {
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
