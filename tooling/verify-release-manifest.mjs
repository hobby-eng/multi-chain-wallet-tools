import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const manifest = readFileSync(resolve(dist, 'SHA256SUMS'), 'utf8').trim().split('\n');
const expectedNames = new Set([
  'activity-viewer/Wallet_Activity_Viewer.html',
  'discovery-scanner/Wallet_Discovery_Scanner.html',
  'key-derivation/Wallet_Key_Derivation_Tool.html',
]);

if (manifest.length !== expectedNames.size) throw new Error('SHA256SUMS must contain exactly three release artifacts.');
for (const line of manifest) {
  const match = /^([0-9a-f]{64})  ([a-z0-9-]+\/[A-Za-z0-9_.-]+)$/u.exec(line);
  if (match === null) throw new Error(`Malformed SHA256SUMS line: ${line}`);
  const [, recorded, name] = match;
  if (!expectedNames.delete(name)) throw new Error(`Unexpected or duplicate release artifact: ${name}`);
  const path = resolve(dist, name);
  if (relative(dist, path) !== name) throw new Error(`Unsafe release artifact name: ${name}`);
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (recorded !== actual) throw new Error(`Release manifest checksum mismatch for ${name}.`);
}
if (expectedNames.size !== 0) throw new Error(`Release manifest is missing: ${[...expectedNames].join(', ')}`);
console.log('Verified dist/SHA256SUMS for all standalone HTML artifacts.');
