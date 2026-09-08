import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBuildProfile } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cliArgs = process.argv.slice(2);
const profile = parseBuildProfile(cliArgs);
const signer = cliArgs.find((arg, index) => (
  !arg.startsWith('--profile=')
  && arg !== '--profile'
  && cliArgs[index - 1] !== '--profile'
));
const manifest = resolve(root, profile.releaseDirectory, 'SHA256SUMS');
const signature = resolve(root, profile.releaseDirectory, 'SHA256SUMS.asc');
if (!existsSync(manifest)) throw new Error('Run the release manifest step before signing.');
const args = ['--armor', '--detach-sign', '--output', signature];
if (signer !== undefined) args.push('--local-user', signer);
args.push(manifest);
const result = spawnSync('gpg', args, { cwd: root, stdio: 'inherit' });
if (result.error !== undefined) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Created ${profile.releaseDirectory}/SHA256SUMS.asc for the exact flat GitHub release manifest.`);
