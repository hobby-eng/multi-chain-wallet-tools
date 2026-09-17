import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createRecoveryWorkbook, recoveryWorkbookRows } from '../src/report-workbook.js';

const report = JSON.stringify({
  format: 'wallet-discovery-report',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  containsSecrets: false,
  safetyNotice: 'public only',
  results: [
    {
      inputId: 'seed-1',
      label: 'Wallet 1',
      coinId: 'future',
      coinLabel: 'Future Coin',
      network: 'mainnet',
      startedAt: '',
      completedAt: '',
      overview: [],
      warnings: [],
      sections: [
        {
          id: 'core',
          title: 'Addresses',
          description: '',
          state: 'complete',
          scanned: '1',
          source: 'Provider',
          proof: 'Validated response',
          metrics: [],
          findings: [
            {
              id: '1',
              title: '=address',
              subtitle: '',
              balanceAtomic: '42',
              balanceLabel: '42 UNIT',
              balanceUnit: { asset: 'UNIT', atomicUnit: 'atom', decimals: 8 },
              fields: [{ label: 'Derivation path', value: 'm/44/0' }],
              history: {
                asset: 'UNIT',
                atomicUnit: 'atom',
                decimals: 8,
                status: 'complete',
                source: 'Provider',
                scope: 'lifetime',
                note: '',
                totalReceivedAtomic: '42',
                totalSentAtomic: '0',
                totalFeesAtomic: null,
                firstSeen: null,
                lastSeen: null,
                transactionCount: 1,
                pendingTransactionCount: 0,
              },
            },
          ],
        },
      ],
    },
  ],
});

describe('Discovery XLSX export', () => {
  it('creates a generic multi-coin workbook from the public report', async () => {
    const rows = recoveryWorkbookRows(report);
    expect(rows.resources[1]?.slice(0, 5)).toEqual(['Wallet 1', 'Future Coin', 'mainnet', 'Addresses', '=address']);
    const archive = unzipSync(new Uint8Array(await (await createRecoveryWorkbook(report)).arrayBuffer()));
    expect(Object.keys(archive)).toContain('xl/workbook.xml');
  });
  it('rejects reports not marked public', () =>
    expect(() => recoveryWorkbookRows(report.replace('false', 'true'))).toThrow(/Unsupported/u));
});
