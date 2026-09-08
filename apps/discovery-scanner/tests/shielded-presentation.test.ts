import type { ShieldedActivity } from '@ckd/dash-network/types.js';
import { describe, expect, it } from 'vitest';
import { shouldDisplayShieldedActivity } from '../src/coins/dash/shielded-filter.js';
import { shieldedFindingPresentation } from '../src/coins/dash/shielded-presentation.js';

describe('Orchard viewing-key presentation', () => {
  const note = {
    value: 1n,
    addressRaw: '00',
    address: 'dash1ztest',
    memoHex: '',
    memo: '',
    noteNullifier: '11',
  };
  const base = { position: 1n, cmx: '22', actionNullifier: '33' };

  it('shows an IVK note by default without claiming it is unspent', () => {
    const unknown = { ...base, direction: 'received', incoming: note } satisfies ShieldedActivity;

    expect(shouldDisplayShieldedActivity(unknown, false)).toBe(true);
    expect(shieldedFindingPresentation(unknown)).toEqual({
      balanceAtomic: 0n,
      balanceLabel: 'Current balance unavailable · spend state unknown',
      spendState: 'Unknown · FVK required',
    });
  });

  it('distinguishes authoritative FVK state from outgoing-only activity', () => {
    const spendable = { ...base, direction: 'received', incoming: note, spent: false } satisfies ShieldedActivity;
    const outgoing = { ...base, position: 2n, direction: 'sent', outgoing: note } satisfies ShieldedActivity;

    expect(shieldedFindingPresentation(spendable)).toEqual({
      balanceAtomic: 1n,
      balanceLabel: '0.00000000001 DASH',
      spendState: 'Unspent',
    });
    expect(shieldedFindingPresentation(outgoing)).toEqual({
      balanceAtomic: 0n,
      balanceLabel: 'Current balance unavailable · outgoing view only',
      spendState: 'Outgoing view only',
    });
  });
});
