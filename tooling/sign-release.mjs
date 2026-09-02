import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifest = resolve(root, 'dist/release/SHA256SUMS');
const signature = resolve(root, 'dist/release/SHA256SUMS.asc');
if (!existsSync(manifest)) throw new Error('Run the release manifest step before signing.');
const args = ['--armor', '--detach-sign', '--output', signature];
if (process.argv[2] !== undefined) args.push('--local-user', process.argv[2]);
args.push(manifest);
const result = spawnSync('gpg', args, { cwd: root, stdio: 'inherit' });
if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('Created dist/release/SHA256SUMS.asc for the exact flat GitHub release manifest.');
