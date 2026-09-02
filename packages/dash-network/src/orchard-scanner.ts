import { bytesToHex, hexToBytes } from '@ckd/core/crypto.js';
import { encodeDashShieldedAddress } from '@ckd/coins/dash/shielded-address.js';
import wasmBytes from '@ckd/dash-wasm/dash_shielded_wasm_bg.wasm';
import {
  derive_shielded_json as deriveOfficialShielded,
  initSync as initializeOfficialOrchard,
  scan_shielded_batch_json as scanOfficialOrchardBatch,
  scan_shielded_incoming_batch_json as scanOfficialOrchardIncomingBatch,
  scan_shielded_outgoing_batch_json as scanOfficialOrchardOutgoingBatch,
  validate_full_viewing_key as validateOfficialFullViewingKey,
  validate_incoming_viewing_key as validateOfficialIncomingViewingKey,
  validate_outgoing_viewing_key as validateOfficialOutgoingViewingKey,
} from '@ckd/dash-wasm/dash_shielded_wasm.js';
import { decodeDashShieldedMemo } from './memo.js';
import type { NormalizedViewingKey } from './viewing-key.js';
import type {
  DecryptedNoteView,
  ScannedMatch,
  ShieldedEncryptedNote,
  ViewerNetwork,
} from './types.js';

const MAX_U64 = (1n << 64n) - 1n;
let wasmInitialized = false;

const SELF_TEST_INCOMING_VIEWING_KEY = 'fae18cbcf032c37f646b0e3f211bda62dc79535f5276abbf274f46ba1d28d571946102f72db50fd672aadddc8346c513221c82e3fbc0c62058a2effb9669f228';
const SELF_TEST_RAW_ADDRESS = 'ee9f8174f92a3f035570ecbfe969aeb46f5e2f64ad69f78d34316c47ea38c2f0085b5788bebf478ce736a8';

interface RawNoteView {
  value: string;
  addressRaw: string;
  memo: string;
  noteNullifier?: string;
}

interface RawMatch {
  position: string;
  cmx: string;
  actionNullifier: string;
  incoming?: RawNoteView;
  outgoing?: RawNoteView;
}

function initWasm(): void {
  if (wasmInitialized) return;
  initializeOfficialOrchard({ module: wasmBytes });
  wasmInitialized = true;
}

function assertHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)) {
    throw new Error(`The official Orchard scanner returned an invalid ${label}.`);
  }
  return value;
}

function parseU64(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`The official Orchard scanner returned an invalid ${label}.`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_U64) throw new Error(`The official Orchard scanner returned an oversized ${label}.`);
  return parsed;
}

function parseNoteView(
  raw: unknown,
  network: ViewerNetwork,
  noteNullifierMode: 'required' | 'forbidden',
): DecryptedNoteView {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('The official Orchard scanner returned an invalid decrypted note.');
  }
  const view = raw as Partial<RawNoteView>;
  const value = parseU64(view.value, 'note value');
  const addressRaw = assertHex(view.addressRaw, 43, 'raw payment address');
  const memoHex = assertHex(view.memo, 36, 'Dash memo');
  const addressBytes = hexToBytes(addressRaw);
  const memoBytes = hexToBytes(memoHex);
  try {
    const parsed: DecryptedNoteView = {
      value,
      addressRaw,
      address: encodeDashShieldedAddress(addressBytes, network === 'mainnet' ? 'dash' : 'tdash'),
      memoHex,
      memo: decodeDashShieldedMemo(memoBytes),
    };
    if (noteNullifierMode === 'required') {
      parsed.noteNullifier = assertHex(view.noteNullifier, 32, 'derived note nullifier');
    } else if (view.noteNullifier !== undefined) {
      throw new Error('Limited viewing-key recovery unexpectedly returned a note nullifier.');
    }
    return parsed;
  } finally {
    addressBytes.fill(0);
    memoBytes.fill(0);
  }
}

function concatenate(notes: ShieldedEncryptedNote[], field: keyof ShieldedEncryptedNote, width: number): Uint8Array {
  const output = new Uint8Array(notes.length * width);
  notes.forEach((note, index) => {
    const value = note[field];
    if (value.length !== width) throw new Error(`DAPI returned ${field} with an invalid byte length.`);
    output.set(value, index * width);
  });
  return output;
}

function parseResult(
  json: string,
  startPosition: bigint,
  notes: ShieldedEncryptedNote[],
  network: ViewerNetwork,
  keyKind: NormalizedViewingKey['kind'],
): ScannedMatch[] {
  let candidate: unknown;
  try {
    candidate = JSON.parse(json);
  } catch {
    throw new Error('The official Orchard scanner returned malformed JSON.');
  }
  if (typeof candidate !== 'object' || candidate === null || !Array.isArray((candidate as { items?: unknown }).items)) {
    throw new Error('The official Orchard scanner returned an invalid result envelope.');
  }
  const seen = new Set<string>();
  return ((candidate as { items: unknown[] }).items).map((item): ScannedMatch => {
    if (typeof item !== 'object' || item === null) throw new Error('The official Orchard scanner returned an invalid match.');
    const raw = item as Partial<RawMatch>;
    const position = parseU64(raw.position, 'note position');
    const offset = position - startPosition;
    if (offset < 0n || offset >= BigInt(notes.length) || offset > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('The official Orchard scanner returned a position outside the requested page.');
    }
    const source = notes[Number(offset)];
    if (source === undefined) throw new Error('The DAPI note page is missing a scanner-referenced position.');
    const cmx = assertHex(raw.cmx, 32, 'note commitment');
    const actionNullifier = assertHex(raw.actionNullifier, 32, 'action nullifier');
    if (cmx !== bytesToHex(source.cmx) || actionNullifier !== bytesToHex(source.nullifier)) {
      throw new Error('The official Orchard scanner result does not match its DAPI input page.');
    }
    if (seen.has(raw.position as string)) throw new Error('The official Orchard scanner returned a duplicate position.');
    seen.add(raw.position as string);
    if (raw.incoming === undefined && raw.outgoing === undefined) {
      throw new Error('The official Orchard scanner returned an empty match.');
    }
    const parsed: ScannedMatch = { position, cmx, actionNullifier };
    if (keyKind === 'incoming' && raw.outgoing !== undefined) {
      throw new Error('Incoming Viewing Key recovery unexpectedly returned an outgoing note.');
    }
    if (keyKind === 'outgoing' && raw.incoming !== undefined) {
      throw new Error('Outgoing Viewing Key recovery unexpectedly returned an incoming note.');
    }
    if (raw.incoming !== undefined) {
      parsed.incoming = parseNoteView(raw.incoming, network, keyKind === 'full' ? 'required' : 'forbidden');
    }
    if (raw.outgoing !== undefined) parsed.outgoing = parseNoteView(raw.outgoing, network, 'forbidden');
    return parsed;
  });
}

export function scanEncryptedPage(
  normalizedKey: NormalizedViewingKey,
  startPosition: bigint,
  notes: ShieldedEncryptedNote[],
  network: ViewerNetwork,
): ScannedMatch[] {
  if (notes.length === 0) return [];
  if (startPosition < 0n || startPosition > MAX_U64) throw new Error('Start position is outside uint64.');
  initWasm();
  const viewingKey = hexToBytes(normalizedKey.hex);
  const cmx = concatenate(notes, 'cmx', 32);
  const nullifiers = concatenate(notes, 'nullifier', 32);
  const cvNet = concatenate(notes, 'cvNet', 32);
  const encryptedNotes = concatenate(notes, 'encryptedNote', 216);
  let json = '';
  try {
    if (normalizedKey.kind === 'full') {
      json = scanOfficialOrchardBatch(viewingKey, startPosition, cmx, nullifiers, cvNet, encryptedNotes);
    } else if (normalizedKey.kind === 'incoming') {
      json = scanOfficialOrchardIncomingBatch(viewingKey, startPosition, cmx, nullifiers, cvNet, encryptedNotes);
    } else {
      json = scanOfficialOrchardOutgoingBatch(viewingKey, startPosition, cmx, nullifiers, cvNet, encryptedNotes);
    }
    return parseResult(json, startPosition, notes, network, normalizedKey.kind);
  } finally {
    viewingKey.fill(0);
    cmx.fill(0);
    nullifiers.fill(0);
    cvNet.fill(0);
    encryptedNotes.fill(0);
    json = '';
  }
}

export function assertCanonicalViewingKey(normalizedKey: NormalizedViewingKey): void {
  initWasm();
  const viewingKey = hexToBytes(normalizedKey.hex);
  try {
    if (normalizedKey.kind === 'full') validateOfficialFullViewingKey(viewingKey);
    else if (normalizedKey.kind === 'incoming') validateOfficialIncomingViewingKey(viewingKey);
    else validateOfficialOutgoingViewingKey(viewingKey);
  } finally {
    viewingKey.fill(0);
  }
}

export interface OrchardRuntimeSelfTestReport {
  passed: true;
  checks: string[];
  durationMs: number;
}

/**
 * Fail-closed browser startup check for the exact Orchard WASM used by the
 * viewer. The seed and every expected value are fixed public test material.
 */
export function runOrchardRuntimeSelfTest(): OrchardRuntimeSelfTestReport {
  const started = performance.now();
  initWasm();
  const seed = new Uint8Array(64).fill(0x42);
  let json = '';
  try {
    json = deriveOfficialShielded(seed, 1, 0, 0, 1);
    const candidate = JSON.parse(json) as {
      fullViewingKey?: unknown;
      incomingViewingKey?: unknown;
      rows?: Array<{ rawAddress?: unknown }>;
    };
    if (
      candidate.incomingViewingKey !== SELF_TEST_INCOMING_VIEWING_KEY
      || candidate.rows?.[0]?.rawAddress !== SELF_TEST_RAW_ADDRESS
      || typeof candidate.fullViewingKey !== 'string'
      || !/^[0-9a-f]{192}$/u.test(candidate.fullViewingKey)
    ) {
      throw new Error('Dash Orchard WASM does not match the fixed ZIP-32 browser vector.');
    }
    if (!seed.every((byte) => byte === 0)) {
      throw new Error('Dash Orchard WASM did not zero its copied self-test seed boundary.');
    }
    const viewingKey: NormalizedViewingKey = { kind: 'full', hex: candidate.fullViewingKey };
    assertCanonicalViewingKey(viewingKey);
    const matches = scanEncryptedPage(viewingKey, 0n, [{
      cmx: new Uint8Array(32),
      nullifier: new Uint8Array(32),
      cvNet: new Uint8Array(32),
      encryptedNote: new Uint8Array(216),
    }], 'testnet');
    if (matches.length !== 0) {
      throw new Error('Dash Orchard WASM returned a false match for the fixed empty scanner boundary.');
    }
    let rejectedInvalid = false;
    try {
      assertCanonicalViewingKey({ kind: 'full', hex: '00'.repeat(96) });
    } catch {
      rejectedInvalid = true;
    }
    if (!rejectedInvalid) throw new Error('Dash Orchard WASM accepted an invalid Full Viewing Key.');
    return {
      passed: true,
      checks: [
        'Dash Orchard ZIP-32 fixed vector',
        'Dash Orchard viewing-key scanner boundary',
        'Invalid Full Viewing Key rejection',
      ],
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    seed.fill(0);
    json = '';
  }
}
