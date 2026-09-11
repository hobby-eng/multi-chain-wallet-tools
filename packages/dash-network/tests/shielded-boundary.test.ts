import { expect, it } from 'vitest';
import { runShieldedPageStream } from '../src/shielded-stream-policy.js';
import { ShieldedActivityLedger } from '../src/activity.js';
import type { ShieldedPage, ScannedMatch } from '../src/types.js';

const page = (count: number, proofHeight: bigint): ShieldedPage => ({
  notes: Array.from({ length: count }, () => ({ cmx: new Uint8Array(32), nullifier: new Uint8Array(32), cvNet: new Uint8Array(32), encryptedNote: new Uint8Array() })),
  proofHeight, coreChainLockedHeight: 1, timeMs: 0n, protocolVersion: 1,
});
const incoming = (position: bigint, value: bigint, nullifier: string): ScannedMatch => ({
  position, cmx: position.toString(), actionNullifier: '00', incoming: {
    value, noteNullifier: nullifier, addressRaw: '00', address: 'synthetic', memoHex: '', memo: '',
  },
});

it.each([1, 2048])('reconciles a nearly full tail before a newer %i-action successor', async successorCount => {
  const ledger = new ShieldedActivityLedger('full');
  const requested: bigint[] = [], applied: bigint[] = [];
  let disposed = 0, first = true;
  const outcome = await runShieldedPageStream({
    fetchPage: async position => {
      requested.push(position);
      if (position === 0n) {
        const result = page(first ? 2047 : 2048, first ? 100n : 101n);
        if (!first) result.notes[2047]!.nullifier.fill(0x11);
        first = false;
        return result;
      }
      const result = page(position === 2048n ? successorCount : 0, 101n);
      // This spends the newly recovered incoming note at 2047: replay order matters.
      if (position === 2048n) result.notes[0]!.nullifier.fill(0x22);
      return result;
    },
    noteCount: p => p.notes.length, revision: p => p.proofHeight,
    onPage: (p, visit) => {
      applied.push(visit.position);
      const matches = visit.position === 0n
        ? [incoming(0n, 100n, '11'.repeat(32)), ...(p.notes.length === 2048 ? [incoming(2047n, 50n, '22'.repeat(32))] : [])]
        : [];
      ledger.applyPage(visit.position, p, matches);
    }, disposePage: () => { disposed++; },
  });
  expect(requested).toEqual([0n, 2048n, 0n, 2048n, 4096n, 4096n]);
  expect(applied).toEqual([0n, 0n, 2048n, 4096n, 4096n]);
  expect(disposed).toBe(requested.length);
  expect(outcome.complete).toBe(true);
  expect(ledger.snapshot(true).balance).toBe(0n);
  expect(ledger.snapshot(true).records.map(r => r.spent)).toEqual([true, true]);
});

it('returns incomplete on the reconciliation budget and disposes unconsumed successors', async () => {
  let height = 0n, applied = 0, disposed = 0;
  const result = await runShieldedPageStream({
    fetchPage: async position => page(position === 0n ? 1 : 0, ++height),
    noteCount: p => p.notes.length, revision: p => p.proofHeight,
    onPage: () => { applied++; }, disposePage: () => { disposed++; }, maximumReconciliations: 2,
  });
  expect(result).toEqual({ complete: false, pageCount: 4, terminalPosition: 0n, limitReason: 'changing-tip' });
  expect(applied).toBe(2); expect(disposed).toBe(4);
});
