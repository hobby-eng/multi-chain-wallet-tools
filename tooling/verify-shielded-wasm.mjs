import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  derive_shielded_json,
  initSync,
  scan_shielded_batch_json,
  scan_shielded_incoming_batch_json,
  scan_shielded_outgoing_batch_json,
  validate_full_viewing_key,
  validate_incoming_viewing_key,
  validate_outgoing_viewing_key,
} from '../packages/dash-shielded-wasm/generated/dash_shielded_wasm.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const declarations = readFileSync(resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm.d.ts'), 'utf8');
if (/\bfetch\b|RequestInfo|export default/u.test(declarations)) {
  throw new Error('Generated WASM declarations expose a removed online loader API.');
}
if (!declarations.includes('scan_shielded_batch_json')) {
  throw new Error('Generated WASM declarations are missing the viewing-key scanner export.');
}
if (!declarations.includes('validate_full_viewing_key')) {
  throw new Error('Generated WASM declarations are missing canonical FVK validation.');
}
for (const exportName of [
  'scan_shielded_incoming_batch_json',
  'scan_shielded_outgoing_batch_json',
  'validate_incoming_viewing_key',
  'validate_outgoing_viewing_key',
]) {
  if (!declarations.includes(exportName)) {
    throw new Error(`Generated WASM declarations are missing ${exportName}.`);
  }
}
const wasm = readFileSync(resolve(root, 'packages/dash-shielded-wasm/generated/dash_shielded_wasm_bg.wasm'));
for (const [pattern, label] of [
  [/\/home\/[A-Za-z0-9._-]+\//u, 'Unix home directory'],
  [/\/Users\/[A-Za-z0-9._-]+\//u, 'macOS home directory'],
  [/[A-Za-z]:\\Users\\[^\\]+\\/u, 'Windows user directory'],
]) {
  if (pattern.test(wasm.toString('latin1'))) {
    throw new Error(`Generated Dash Orchard WASM exposes a private ${label} build path.`);
  }
}
initSync({ module: wasm });

const expectedIncomingViewingKey = 'fae18cbcf032c37f646b0e3f211bda62dc79535f5276abbf274f46ba1d28d571946102f72db50fd672aadddc8346c513221c82e3fbc0c62058a2effb9669f228';
const expectedRawAddress = 'ee9f8174f92a3f035570ecbfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8';
const testSeed = new Uint8Array(64).fill(0x42);
const testnet = JSON.parse(derive_shielded_json(testSeed, 1, 0, 0, 1));
if (testnet.incomingViewingKey !== expectedIncomingViewingKey || testnet.rows?.[0]?.rawAddress !== expectedRawAddress) {
  throw new Error('Generated browser WASM does not match the audited Dash Orchard fixed vector.');
}
if (!testSeed.every((byte) => byte === 0)) {
  throw new Error('Generated browser WASM did not zero its copied seed boundary buffer.');
}
const mainSeed = new Uint8Array(64).fill(0x42);
const mainnet = JSON.parse(derive_shielded_json(mainSeed, 5, 0, 0, 1));
if (mainnet.rows?.[0]?.rawAddress === testnet.rows?.[0]?.rawAddress || mainnet.spendingKey === testnet.spendingKey) {
  throw new Error('Dash Shielded mainnet and testnet domain separation failed.');
}
if (!mainSeed.every((byte) => byte === 0)) {
  throw new Error('Generated browser WASM did not zero its copied mainnet seed buffer.');
}
const viewingKey = Uint8Array.from(Buffer.from(testnet.fullViewingKey, 'hex'));
const validationKey = viewingKey.slice();
validate_full_viewing_key(validationKey);
if (!validationKey.every((byte) => byte === 0)) {
  throw new Error('Generated browser WASM did not zero the canonical-validation FVK buffer.');
}
const emptyScan = JSON.parse(scan_shielded_batch_json(
  viewingKey,
  0n,
  new Uint8Array(32),
  new Uint8Array(32),
  new Uint8Array(32),
  new Uint8Array(216),
));
if (!Array.isArray(emptyScan.items) || emptyScan.items.length !== 0) {
  throw new Error('Generated browser WASM viewing-key scanner returned an invalid empty-page result.');
}
if (!viewingKey.every((byte) => byte === 0)) {
  throw new Error('Generated browser WASM did not zero its copied full viewing key boundary buffer.');
}
for (const [hexKey, validate, scan, label] of [
  [testnet.incomingViewingKey, validate_incoming_viewing_key, scan_shielded_incoming_batch_json, 'incoming'],
  [testnet.outgoingViewingKey, validate_outgoing_viewing_key, scan_shielded_outgoing_batch_json, 'outgoing'],
]) {
  const validationCopy = Uint8Array.from(Buffer.from(hexKey, 'hex'));
  validate(validationCopy);
  if (!validationCopy.every((byte) => byte === 0)) {
    throw new Error(`Generated browser WASM did not zero the ${label} validation buffer.`);
  }
  const scanKey = Uint8Array.from(Buffer.from(hexKey, 'hex'));
  const limitedScan = JSON.parse(scan(
    scanKey,
    0n,
    new Uint8Array(32),
    new Uint8Array(32),
    new Uint8Array(32),
    new Uint8Array(216),
  ));
  if (!Array.isArray(limitedScan.items) || limitedScan.items.length !== 0) {
    throw new Error(`Generated browser WASM ${label} scanner returned an invalid empty result.`);
  }
  if (!scanKey.every((byte) => byte === 0)) {
    throw new Error(`Generated browser WASM did not zero its ${label} viewing key boundary buffer.`);
  }
}
const invalidViewingKey = Uint8Array.from(Buffer.from(testnet.fullViewingKey, 'hex'));
let rejectedMalformedBatch = false;
try {
  scan_shielded_batch_json(
    invalidViewingKey,
    0n,
    new Uint8Array(32),
    new Uint8Array(31),
    new Uint8Array(32),
    new Uint8Array(216),
  );
} catch {
  rejectedMalformedBatch = true;
}
if (!rejectedMalformedBatch || !invalidViewingKey.every((byte) => byte === 0)) {
  throw new Error('Generated browser WASM did not reject malformed scanner input and zero the viewing key.');
}
console.log('Verified generated Dash Orchard WASM vectors, domain separation, scanner boundary, and key zeroing.');
