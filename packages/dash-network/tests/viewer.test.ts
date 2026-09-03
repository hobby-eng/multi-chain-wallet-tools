import { describe, expect, it } from 'vitest';
import { ShieldedActivityLedger } from '../src/activity.js';
import { copyAndFreeEvoShieldedNote } from '../src/evo-shielded-note.js';
import { decodeDashShieldedMemo, formatPlatformCredits } from '../src/memo.js';
import type { ScannedMatch, ShieldedEncryptedNote, ShieldedPage } from '../src/types.js';
import { normalizeViewingKey } from '../src/viewing-key.js';

function field(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function wireNote(actionNullifier: number): ShieldedEncryptedNote {
  return {
    cmx: field(actionNullifier + 1),
    nullifier: field(actionNullifier),
    cvNet: field(actionNullifier + 2),
    encryptedNote: new Uint8Array(216),
  };
}

function page(notes: ShieldedEncryptedNote[], height = 50n): ShieldedPage {
  return {
    notes,
    proofHeight: height,
    coreChainLockedHeight: 45,
    protocolVersion: 13,
    timeMs: 1_788_284_400_000n,
  };
}

function incoming(position: bigint, cmxByte: number, nullifierByte: number, value: bigint): ScannedMatch {
  return {
    position,
    cmx: cmxByte.toString(16).padStart(2, '0').repeat(32),
    actionNullifier: '00'.repeat(32),
    incoming: {
      value,
      addressRaw: '11'.repeat(43),
      address: 'tdash1test',
      memoHex: '00'.repeat(36),
      memo: '',
      noteNullifier: nullifierByte.toString(16).padStart(2, '0').repeat(32),
    },
  };
}

function outgoing(position: bigint, cmxByte: number, value: bigint): ScannedMatch {
  return {
    position,
    cmx: cmxByte.toString(16).padStart(2, '0').repeat(32),
    actionNullifier: '00'.repeat(32),
    outgoing: {
      value,
      addressRaw: '22'.repeat(43),
      address: 'tdash1recipient',
      memoHex: '00'.repeat(36),
      memo: '',
    },
  };
}

describe('Dash shielded viewer primitives', () => {
  it('copies SDK-owned Orchard note bytes before releasing the WASM object', () => {
    const source = {
      cmx: field(1),
      nullifier: field(2),
      cvNet: field(3),
      encryptedNote: new Uint8Array(216).fill(4),
      free(): void {
        this.cmx.fill(0);
        this.nullifier.fill(0);
        this.cvNet.fill(0);
        this.encryptedNote.fill(0);
      },
    };
    const copy = copyAndFreeEvoShieldedNote(source);
    expect(copy.cmx[0]).toBe(1);
    expect(copy.nullifier[0]).toBe(2);
    expect(copy.cvNet[0]).toBe(3);
    expect(copy.encryptedNote[0]).toBe(4);
    expect(source.cmx[0]).toBe(0);
  });

  it('normalizes and classifies raw Orchard viewing-key capabilities', () => {
    const full = 'ab'.repeat(96);
    expect(normalizeViewingKey(`  0x${full.slice(0, 80)}\n${full.slice(80)}  `)).toEqual({
      hex: full,
      kind: 'full',
    });
    expect(normalizeViewingKey('cd'.repeat(64))).toEqual({ hex: 'cd'.repeat(64), kind: 'incoming' });
    expect(normalizeViewingKey('ef'.repeat(32), 'outgoing')).toEqual({
      hex: 'ef'.repeat(32),
      kind: 'outgoing',
    });
    expect(() => normalizeViewingKey('ef'.repeat(32))).toThrow(/spending key/u);
    expect(() => normalizeViewingKey(full, 'outgoing')).toThrow(/Outgoing-only mode/u);
    expect(() => normalizeViewingKey('ab'.repeat(63))).toThrow(/64-byte IVK/u);
    expect(() => normalizeViewingKey('zz'.repeat(96))).toThrow(/hexadecimal/u);
  });

  it('accepts the strict watch-only viewing bundle and preserves its network', () => {
    const fullViewingKey = 'ab'.repeat(96);
    expect(normalizeViewingKey(JSON.stringify({
      format: 'dash-shielded-viewing-bundle',
      version: 1,
      network: 'testnet',
      accountPath: "m/32'/1'/0'",
      fullViewingKey,
    }))).toEqual({ hex: fullViewingKey, kind: 'full', bundleNetwork: 'testnet' });
    expect(() => normalizeViewingKey('{"format":"wrong"}')).toThrow(/format or version/u);
  });

  it('decodes the official empty and text memo layout without losing unknown kinds', () => {
    expect(decodeDashShieldedMemo(new Uint8Array(36))).toBe('');
    const text = new Uint8Array(36);
    new DataView(text.buffer).setUint32(0, 1, true);
    text.set(new TextEncoder().encode('hello shielded'), 4);
    expect(decodeDashShieldedMemo(text)).toBe('hello shielded');
    const unknown = new Uint8Array(36);
    new DataView(unknown.buffer).setUint32(0, 42, true);
    expect(decodeDashShieldedMemo(unknown)).toBe('Raw memo kind 42');
    expect(() => decodeDashShieldedMemo(new Uint8Array(35))).toThrow(/36 bytes/u);
  });

  it('strips bidirectional and control characters from an attacker-supplied memo', () => {
    const spoof = new Uint8Array(36);
    new DataView(spoof.buffer).setUint32(0, 1, true);
    // U+202E reverses the rendering of everything after it, which is enough to
    // make a memo appear to say something else beside a real address.
    spoof.set(new TextEncoder().encode('paid‮dnuf er'), 4);
    expect(decodeDashShieldedMemo(spoof)).toBe('paiddnuf er');
  });

  it('formats Platform credits using the official 10^11 credits per DASH ratio', () => {
    expect(formatPlatformCredits(0n)).toBe('0 DASH');
    expect(formatPlatformCredits(100_000_000_000n)).toBe('1 DASH');
    expect(formatPlatformCredits(150_000_000_001n)).toBe('1.50000000001 DASH');
  });

  it('reconstructs incoming spend state and excludes change from external sends', () => {
    const ledger = new ShieldedActivityLedger();
    const firstNote = wireNote(0);
    const spendOfFirst = wireNote(0xaa);
    ledger.applyPage(0n, page([firstNote, spendOfFirst]), [
      incoming(0n, 1, 0xaa, 500n),
      outgoing(1n, 0xab, 300n),
    ]);
    const snapshot = ledger.snapshot(true);
    expect(snapshot.balance).toBe(0n);
    expect(snapshot.receivedExternal).toBe(500n);
    expect(snapshot.sentExternal).toBe(300n);
    expect(snapshot.records[0]?.spent).toBe(true);
    expect(snapshot.records[0]?.spentAtPosition).toBe(1n);
    expect(snapshot.scannedNotes).toBe(2n);
    expect(snapshot.proofHeight).toBe(50n);
  });

  it('classifies a note recovered by both IVK and OVK as self/change', () => {
    const ledger = new ShieldedActivityLedger();
    const match = incoming(5n, 7, 0xbb, 250n);
    match.outgoing = {
      value: 250n,
      addressRaw: match.incoming?.addressRaw ?? '',
      address: match.incoming?.address ?? '',
      memoHex: match.incoming?.memoHex ?? '',
      memo: '',
    };
    ledger.applyPage(5n, page([wireNote(3)]), [match]);
    const snapshot = ledger.snapshot(true);
    expect(snapshot.records[0]?.direction).toBe('self');
    expect(snapshot.selfOrChange).toBe(250n);
    expect(snapshot.sentExternal).toBe(0n);
    expect(snapshot.balance).toBe(250n);
  });

  it('does not invent balance or spend state for an incoming-only key', () => {
    const ledger = new ShieldedActivityLedger('incoming');
    ledger.applyPage(0n, page([wireNote(0)]), [incoming(0n, 1, 0xaa, 500n)]);
    const snapshot = ledger.snapshot(true);
    expect(snapshot.balance).toBeNull();
    expect(snapshot.receivedExternal).toBe(500n);
    expect(snapshot.sentExternal).toBeNull();
    expect(snapshot.selfOrChange).toBeNull();
    expect(snapshot.records[0]?.spent).toBeUndefined();
  });

  it('does not invent incoming activity or balance for an outgoing-only key', () => {
    const ledger = new ShieldedActivityLedger('outgoing');
    ledger.applyPage(0n, page([wireNote(0)]), [outgoing(0n, 1, 700n)]);
    const snapshot = ledger.snapshot(true);
    expect(snapshot.balance).toBeNull();
    expect(snapshot.receivedExternal).toBeNull();
    expect(snapshot.sentExternal).toBe(700n);
    expect(snapshot.selfOrChange).toBeNull();
  });

  it('rejects inconsistent or out-of-page scanner results', () => {
    const ledger = new ShieldedActivityLedger();
    expect(() => ledger.applyPage(0n, page([wireNote(1)]), [incoming(2n, 2, 3, 1n)])).toThrow(/outside/u);
    const mismatch = incoming(0n, 2, 3, 1n);
    mismatch.outgoing = {
      value: 2n,
      addressRaw: mismatch.incoming?.addressRaw ?? '',
      address: mismatch.incoming?.address ?? '',
      memoHex: mismatch.incoming?.memoHex ?? '',
      memo: '',
    };
    expect(() => ledger.applyPage(0n, page([wireNote(1)]), [mismatch])).toThrow(/disagree/u);
  });
});
