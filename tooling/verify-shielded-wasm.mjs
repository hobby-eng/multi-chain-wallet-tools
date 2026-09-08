import assert from 'node:assert/strict';
import { build } from 'esbuild';
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

// These committed ciphertexts must actually decrypt through the generated ABI.
// The expected plaintext is independent of the scanner implementation.
const ledgerBundle = await build({
  entryPoints: [resolve(root, 'packages/dash-network/src/activity.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent',
  tsconfig: resolve(root, 'tsconfig.json'),
});
const { ShieldedActivityLedger } = await import(`data:text/javascript;base64,${Buffer.from(ledgerBundle.outputFiles[0].text).toString('base64')}`);
const bytes = (hex) => Uint8Array.from(Buffer.from(hex, 'hex'));
for (const name of ['official-platform-wallet-note.json', 'internal-scope-note.json']) {
  const fixture = JSON.parse(readFileSync(resolve(root, 'packages/dash-shielded-wasm/rust/fixtures', name), 'utf8'));
  function scanFixture(scan, hexKey) {
    const key = bytes(hexKey);
    const result = JSON.parse(scan(key, BigInt(fixture.position), bytes(fixture.cmx), bytes(fixture.actionNullifier), bytes(fixture.cvNet), bytes(fixture.encryptedNote)));
    assert.ok(key.every(byte => byte === 0), `${name}: key buffer was not wiped`);
    return result.items;
  }
  const full = scanFixture(scan_shielded_batch_json, fixture.recipientFullViewingKey);
  assert.equal(full.length, 1, `${name}: FVK did not recover exactly one note`);
  const item = full[0];
  assert.equal(item.position, String(fixture.position));
  assert.equal(item.cmx, fixture.cmx);
  assert.equal(item.actionNullifier, fixture.actionNullifier);
  const expected = { value: fixture.expected.value, addressRaw: fixture.expected.addressRaw, memo: fixture.expected.memo };
  assert.deepEqual(item.outgoing, expected);
  assert.deepEqual(item.incoming, { ...expected, noteNullifier: item.incoming.noteNullifier });
  assert.match(item.incoming.noteNullifier, /^[0-9a-f]{64}$/u);
  if (fixture.expected.noteNullifier) assert.equal(item.incoming.noteNullifier, fixture.expected.noteNullifier);
  const outgoing = scanFixture(scan_shielded_outgoing_batch_json, fixture.senderOutgoingViewingKey);
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].incoming, undefined);
  assert.deepEqual(outgoing[0].outgoing, expected);
  if (fixture.recipientIncomingViewingKey) {
    const incoming = scanFixture(scan_shielded_incoming_batch_json, fixture.recipientIncomingViewingKey);
    assert.equal(incoming.length, 1);
    assert.equal(incoming[0].outgoing, undefined);
    assert.deepEqual(incoming[0].incoming, expected);
    assert.deepEqual(scanFixture(scan_shielded_incoming_batch_json, fixture.externalIncomingViewingKey), []);
  }
  assert.deepEqual(scanFixture(scan_shielded_batch_json, testnet.fullViewingKey), []);

  const recovered = (note) => ({ ...note, value: BigInt(note.value), memoHex: note.memo });
  const match = { ...item, position: BigInt(item.position), incoming: recovered(item.incoming), outgoing: recovered(item.outgoing) };
  const wire = { cmx: bytes(fixture.cmx), nullifier: bytes(fixture.actionNullifier), cvNet: bytes(fixture.cvNet), encryptedNote: bytes(fixture.encryptedNote) };
  const page = { notes: [wire], proofHeight: 1n, coreChainLockedHeight: 1, timeMs: 0n, protocolVersion: 1 };
  const ledger = new ShieldedActivityLedger('full');
  ledger.applyPage(match.position, page, [match]);
  assert.equal(ledger.snapshot(false).balance, BigInt(expected.value));
  ledger.applyPage(match.position + 1n, { ...page, notes: [{ ...wire, nullifier: bytes(item.incoming.noteNullifier) }] }, []);
  const spent = ledger.snapshot(true);
  assert.equal(spent.balance, 0n);
  assert.equal(spent.records.length, 1);
  assert.equal(spent.records[0].spentAtPosition, match.position + 1n);
  assert.equal(spent.records[0].spent, true);
}
console.log('Verified compiled WASM External/Internal ciphertext recovery, exact plaintext, Internal nullifier, IVK/OVK capabilities, key wiping, and ledger spend reconstruction.');
