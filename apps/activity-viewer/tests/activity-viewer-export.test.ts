import { describe, expect, it } from 'vitest';
import { createViewerExport, type ViewerExportState } from '../src/export.js';

const generatedAt = new Date('2026-09-01T21:30:00.000Z');

describe('viewer exports', () => {
  it('exports exact Core amounts and spreadsheet-safe text to CSV', () => {
    const state: ViewerExportState = {
      mode: 'core',
      network: 'mainnet',
      snapshot: {
        kind: 'core', provider: 'DashScan', address: 'Xexample', network: 'mainnet',
        balanceDuffs: 9_007_199_254_740_993n, unconfirmedDuffs: 0n,
        totalReceivedDuffs: 9_007_199_254_740_994n, totalSentDuffs: 1n,
        transactionCount: 1, historyLimit: 20, endpoint: 'https://example.invalid',
        indexStatus: 'ok', indexedHeight: 10, indexedTimeMs: generatedAt.getTime(), requests: 4,
        transactions: [{
          txid: '=unsafe', type: 'CLASSIC', timestampMs: generatedAt.getTime(), blockHeight: 9,
          confirmations: 2, instantLocked: true, chainLocked: false, receivedDuffs: 2n,
          spentInputDuffs: 1n, netDuffs: 1n, feeDuffs: 1n, blockHash: 'ab',
        }],
      },
    };
    const result = createViewerExport(state, 'csv', generatedAt);
    expect(result.filename).toBe('wallet-activity-viewer-core-mainnet-20260901T213000Z.csv');
    expect(result.text).toContain('9007199254740993');
    expect(result.text).toContain("'=unsafe");
    expect(result.text).not.toContain('example.invalid');
  });

  it('serializes bigint Platform state exactly in JSON', () => {
    const state: ViewerExportState = {
      mode: 'platform', network: 'testnet',
      snapshot: {
        kind: 'platform', address: 'tdash1kexample', network: 'testnet', exists: true,
        balanceCredits: 9_007_199_254_740_993n, nonce: 7n, proofHeight: 12n,
        coreChainLockedHeight: 10, protocolVersion: 1, responseTimeMs: 1n,
      },
      history: {
        provider: 'Dash Platform Explorer', address: 'tdash1kexample', base58Address: null,
        totalTransitions: 0, incomingTransitions: 0, outgoingTransitions: 0,
        totalIncomingCredits: 0n, totalOutgoingCredits: 0n,
        explorerBalanceCredits: 9_007_199_254_740_993n, explorerNonce: 7, transitions: [],
        historyLimit: 20, endpoint: 'https://example.invalid', indexStatus: 'synced',
        indexedHeight: 12, indexedTimeMs: generatedAt.getTime(), requests: 3,
      },
    };
    const result = createViewerExport(state, 'json', generatedAt);
    expect(JSON.parse(result.text)).toMatchObject({
      schema: 'wallet-activity-viewer-export', version: 1, mode: 'platform', network: 'testnet',
      data: { snapshot: { balanceCredits: '9007199254740993', nonce: '7' } },
    });
  });

  it('never needs or exports the Orchard viewing-key input', () => {
    const state: ViewerExportState = {
      mode: 'shielded', network: 'mainnet',
      snapshot: {
        records: [], scannedNotes: 25n, proofHeight: 2n, protocolVersion: 1,
        complete: true, keyKind: 'full', balance: 0n, receivedExternal: 0n,
        sentExternal: 0n, selfOrChange: 0n,
      },
    };
    const result = createViewerExport(state, 'json', generatedAt);
    expect(result.text).not.toMatch(/viewing.?key|fvk|ivk|ovk/iu);
    expect(JSON.parse(result.text).data.snapshot.scannedNotes).toBe('25');
  });
});
