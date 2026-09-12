import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_PROFILES } from './build-profiles.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const recordPath = resolve(root, 'dist/verification-record.json');
const bytes = readFileSync(recordPath);
const record = JSON.parse(bytes);
if (record.schemaVersion !== 1 || !Array.isArray(record.artifacts) || record.artifacts.length !== 8) {
  throw new Error('Verification record has an unsupported schema or incomplete artifact list.');
}
for (const entry of [...record.artifacts, ...record.wasm]) {
  const actual = createHash('sha256').update(readFileSync(resolve(root, entry.path))).digest('hex');
  if (actual !== entry.sha256) throw new Error(`Verification record hash mismatch: ${entry.path}`);
}
const recordHash = createHash('sha256').update(bytes).digest('hex');
for (const profile of Object.values(BUILD_PROFILES)) {
  const release = resolve(root, profile.releaseDirectory);
  if (!readFileSync(resolve(release, 'verification-record.json')).equals(bytes)) {
    throw new Error(`${profile.editionName} release contains a different verification record.`);
  }
  const line = `${recordHash}  verification-record.json`;
  if (!readFileSync(resolve(release, 'SHA256SUMS'), 'utf8').trim().split('\n').includes(line)) {
    throw new Error(`${profile.editionName} release manifest omits the verification record.`);
  }
}
console.log(`Verified verification-record.json: ${recordHash}`);
