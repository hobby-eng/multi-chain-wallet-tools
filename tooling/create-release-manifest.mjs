import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const artifacts = [
  'activity-viewer/Wallet_Activity_Viewer.html',
  'discovery-scanner/Wallet_Discovery_Scanner.html',
  'key-derivation/Wallet_Key_Derivation_Tool.html',
];
const lines = artifacts.map((name) => {
  const path = resolve(dist, name);
  if (!existsSync(path)) throw new Error(`Release artifact is missing: dist/${name}.`);
  return `${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${name}`;
});
writeFileSync(resolve(dist, 'SHA256SUMS'), `${lines.join('\n')}\n`);
console.log('Created dist/SHA256SUMS for all release artifacts.');
