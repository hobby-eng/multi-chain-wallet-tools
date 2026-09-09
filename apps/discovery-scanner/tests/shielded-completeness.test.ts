import { expect, it } from 'vitest';
import { ShieldedActivityLedger } from '@ckd/dash-network/activity.js';
import { sectionFromLedger } from '../src/coins/dash/shielded-section.js';
import { summarizeDashSections } from '../src/coins/dash/summary.js';
import { createRecoveryExport } from '../src/export.js';
import type { RecoveryWalletResult } from '../src/types.js';

it('withholds an incomplete balance in presentation, aggregate, JSON and CSV, retaining observed note values', () => {
  const ledger = new ShieldedActivityLedger('full');
  const wire = { cmx: new Uint8Array(32), nullifier: new Uint8Array(32), cvNet: new Uint8Array(32), encryptedNote: new Uint8Array() };
  const page = { notes: [wire], proofHeight: 1n, coreChainLockedHeight: 1, timeMs: 1n, protocolVersion: 1 };
  ledger.applyPage(0n, page, [{ position: 0n, cmx: '00', actionNullifier: '00', incoming: {
    value: 100_000_000_000n, addressRaw: '00', address: 'public-note', memoHex: '', memo: '', noteNullifier: '11'.repeat(32),
  } }]);
  const section = (complete: boolean) => sectionFromLedger(ledger, { includeUsedZeroBalance: true, accountPathLabel: 'FVK' },
    { complete, pageCount: 1, terminalPosition: 1n }, false, () => {});
  const partial = section(false);
  const complete = section(true);
  expect(partial.findings[0]!.balanceAtomic).toBeNull();
  expect(partial.findings[0]!.fields).toContainEqual({ label: 'Spend state', value: 'Unknown · scan incomplete' });
  expect(partial.metrics).toContainEqual({ label: 'Observed received', value: '1 DASH' });
  expect(partial.metrics.some(({ label }) => label.startsWith('Lifetime'))).toBe(false);
  expect(complete.findings[0]!.balanceAtomic).toBe(100_000_000_000n);
  const overview = summarizeDashSections([partial]);
  expect(overview.find(({ label }) => label === 'Total located value')!.value).toMatch(/Unavailable/u);
  expect(overview.find(({ label }) => label === 'Shielded spendable')!.value).toBe('Unavailable');
  const result: RecoveryWalletResult = { inputId: 'test', label: 'Test', coinId: 'dash', coinLabel: 'Dash', network: 'mainnet',
    startedAt: '', completedAt: '', overview, warnings: [], sections: [partial] };
  const json = JSON.parse(createRecoveryExport([result], 'json').text);
  expect(json.results[0].sections[0].findings[0].balanceAtomic).toBeNull();
  expect(json.results[0].sections[0].balanceAvailable).toBe(false);
  const csv = createRecoveryExport([result], 'csv').text.trim().replace(/^\uFEFF/u, '').split('\r\n');
  // This fixture has no comma-bearing values; all cells are CSV-quoted.
  const cells = (line: string) => line.slice(1, -1).split('","');
  const headers = cells(csv[0]!); const row = cells(csv[1]!);
  for (const column of ['balance_atomic', 'balance_dash', 'section_spendable_balance_dash', 'section_lifetime_received_dash']) {
    expect(row[headers.indexOf(column)], column).toBe('');
  }
  expect(row[headers.indexOf('note_value_dash')]).toBe('1');
  expect(row[headers.indexOf('section_observed_received_dash')]).toBe('1');
  // An observed spend remains known even if the remaining stream is incomplete.
  ledger.applyPage(1n, { ...page, notes: [{ ...wire, nullifier: new Uint8Array(32).fill(0x11) }] }, []);
  expect(section(false).findings[0]!.balanceAtomic).toBe(0n);
  expect(section(false).findings[0]!.fields).toContainEqual({ label: 'Spend state', value: 'Spent' });
});

it('does not infer a zero account balance from an empty incoming-only scan', () => {
  const section = sectionFromLedger(new ShieldedActivityLedger('incoming'), { includeUsedZeroBalance: true, accountPathLabel: 'IVK' },
    { complete: true, pageCount: 2, terminalPosition: 0n }, false, () => {});
  expect(section.state).toBe('complete');
  expect(section.balanceAvailable).toBe(false);
  expect(summarizeDashSections([section]).find(({ label }) => label === 'Shielded spendable')!.value).toBe('Unavailable');
});
