import { describe, expect, it } from 'vitest';
import {
  createViewerExport,
  createViewerWorkbookExport,
  type ViewerExportState,
  type ViewerSingleExportState,
} from '../src/export.js';
import { strFromU8, unzipSync } from 'fflate';

const generatedAt = new Date('2026-09-01T21:30:00.000Z');

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if (character === '\n' && !quoted) {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (character !== '\r') {
      field += character;
    }
  }
  if (row.length > 0 || field.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

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
      schema: 'wallet-activity-viewer-export', version: 2, mode: 'platform', network: 'testnet',
      data: { state: { balanceCredits: '9007199254740993', nonce: '7' } },
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
    expect(JSON.parse(result.text).data.summary.scannedNotes).toBe('25');
  });

  it('exports proof-verified Identity names and key metadata without secret input', () => {
    const identityId = 'HhNWsiTQfpJwnqenTFVUG8JqNwAeccWmAYW2vjEvNNXY';
    const state: ViewerExportState = {
      mode: 'identity',
      network: 'mainnet',
      snapshot: {
        kind: 'identity',
        network: 'mainnet',
        inputKind: 'public-key-hash',
        inputLabel: 'Public-key HASH160',
        publicKeyHashHex: 'ab'.repeat(20),
        resolvedDpnsName: null,
        resolvedDpnsDocumentId: null,
        resolvedRegistrationTransactionHash: null,
        proofs: [{
          height: 12n,
          coreChainLockedHeight: 10,
          protocolVersion: 13,
          responseTimeMs: 1n,
        }, {
          height: 12n,
          coreChainLockedHeight: 10,
          protocolVersion: 13,
          responseTimeMs: 1n,
        }],
        requests: 3,
        identities: [{
          identifier: identityId,
          identifierHex: '01'.repeat(32),
          balanceCredits: 123n,
          revision: 2n,
          nonce: 7n,
          dpnsNames: ['alice.dash'],
          publicKeys: [{
            keyId: 1,
            purpose: 'AUTHENTICATION',
            purposeNumber: 0,
            securityLevel: 'MASTER',
            securityLevelNumber: 0,
            keyType: 'ECDSA_SECP256K1',
            keyTypeNumber: 0,
            dataHex: `02${'11'.repeat(32)}`,
            publicKeyHashHex: 'ab'.repeat(20),
            readOnly: false,
            isMaster: true,
            disabledAtMs: null,
            contractBounds: null,
            matchesLookup: true,
          }],
        }],
      },
      histories: [{ identifier: identityId, history: null, error: 'Explorer unavailable' }],
    };

    const json = createViewerExport(state, 'json', generatedAt);
    expect(json.text).toContain('alice.dash');
    expect(json.text).toContain('"matchesLookup": true');
    expect(json.text).not.toMatch(/privateKey|mnemonic|xprv/iu);
    expect(JSON.parse(json.text)).toMatchObject({
      version: 2,
      data: {
        query: { proofs: [{ height: '12', responseCount: 2 }] },
        identities: [{
          identifier: identityId,
          state: { balanceCredits: '123', revision: '2', nonce: '7' },
          history: null,
          historyError: 'Explorer unavailable',
        }],
      },
    });

    const csv = createViewerExport(state, 'csv', generatedAt);
    expect(csv.text).toContain('alice.dash');
    expect(csv.text).toContain('public_key');
    expect(csv.text).toContain('ECDSA_SECP256K1');
    const [header, ...rows] = parseCsv(csv.text);
    expect(rows.every((row) => row.length === header!.length)).toBe(true);
    expect(header).toHaveLength(23);
    expect(header).not.toContain('details');
    expect(rows.map((row) => row[header!.indexOf('record_type')])).toEqual(['query', 'identity', 'public_key']);
    expect(csv.text).not.toContain('{"publicKeyHash"');
  });

  it('exports a batch as one file with one header, stable labels, and isolated errors', () => {
    const first: ViewerSingleExportState = {
      mode: 'core',
      network: 'mainnet',
      snapshot: {
        kind: 'core', provider: 'DashScan', address: 'Xfirst', network: 'mainnet',
        balanceDuffs: 1n, unconfirmedDuffs: 0n, totalReceivedDuffs: 1n, totalSentDuffs: 0n,
        transactionCount: 0, transactions: [], historyLimit: 20, endpoint: 'https://example.invalid',
        indexStatus: 'ok', indexedHeight: 10, indexedTimeMs: generatedAt.getTime(), requests: 2,
      },
    };
    const second: ViewerSingleExportState = {
      mode: 'core',
      network: 'mainnet',
      snapshot: {
        kind: 'core', provider: 'DashScan', address: 'Xsecond', network: 'mainnet',
        balanceDuffs: 2n, unconfirmedDuffs: 0n, totalReceivedDuffs: 2n, totalSentDuffs: 0n,
        transactionCount: 0, transactions: [], historyLimit: 20, endpoint: 'https://example.invalid',
        indexStatus: 'ok', indexedHeight: 10, indexedTimeMs: generatedAt.getTime(), requests: 2,
      },
    };
    const state: ViewerExportState = {
      batch: true,
      mode: 'core',
      network: 'mainnet',
      items: [
        { id: 'query-1', label: '1 · Xfirst', state: first },
        { id: 'query-2', label: '2 · Xsecond', state: second },
      ],
      errors: [{ id: 'query-3', label: '3 · invalid', message: 'Invalid address.' }],
    };

    const csv = createViewerExport(state, 'csv', generatedAt);
    const [header, ...rows] = parseCsv(csv.text);
    expect(csv.filename).toContain('-batch-');
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.length === header!.length)).toBe(true);
    expect(rows.map((row) => row[header!.indexOf('query_label')])).toEqual([
      '1 · Xfirst',
      '2 · Xsecond',
      '3 · invalid',
    ]);

    const json = createViewerExport(state, 'json', generatedAt);
    expect(JSON.parse(json.text)).toMatchObject({
      version: 2,
      data: {
        batch: { requested: 3, succeeded: 2, failed: 1 },
        results: [{ id: 'query-1', label: '1 · Xfirst' }, { id: 'query-2', label: '2 · Xsecond' }],
        errors: [{ id: 'query-3', message: 'Invalid address.' }],
      },
    });
  });

  it('exports mixed batch records with their detected modes', () => {
      const core: ViewerSingleExportState = {
        mode: 'core',
        network: 'mainnet',
        snapshot: {
          kind: 'core', provider: 'DashScan', address: 'Xfirst', network: 'mainnet',
          balanceDuffs: 1n, unconfirmedDuffs: 0n, totalReceivedDuffs: 1n, totalSentDuffs: 0n,
          transactionCount: 0, transactions: [], historyLimit: 20, endpoint: 'https://example.invalid',
          indexStatus: 'ok', indexedHeight: 10, indexedTimeMs: generatedAt.getTime(), requests: 2,
        },
      };
      const shielded: ViewerSingleExportState = {
        mode: 'shielded',
        network: 'mainnet',
        snapshot: {
          records: [], scannedNotes: 25n, proofHeight: 12n, protocolVersion: 13,
          complete: true, keyKind: 'full', balance: 0n, receivedExternal: 0n,
          sentExternal: 0n, selfOrChange: 0n,
        },
      };
      const state: ViewerExportState = {
        batch: true,
        mode: 'mixed',
        network: 'mainnet',
        items: [
          { id: 'query-1', label: '1 · CORE · Xfirst', state: core },
          { id: 'query-2', label: '2 · ORCHARD · FULL viewing key', state: shielded },
        ],
        errors: [],
      };

      const json = createViewerExport(state, 'json', generatedAt);
      expect(json.filename).toContain('wallet-activity-viewer-mixed-batch-mainnet');
      expect(JSON.parse(json.text)).toMatchObject({
        mode: 'mixed',
        data: {
          results: [
            { id: 'query-1', mode: 'core' },
            { id: 'query-2', mode: 'shielded' },
          ],
        },
      });

      const csv = createViewerExport(state, 'csv', generatedAt);
      const [header, ...rows] = parseCsv(csv.text);
      const modeIndex = header!.indexOf('mode');
      expect(rows.map((row) => row[modeIndex])).toEqual(['core', 'shielded']);
  });

  it('redacts failed Orchard input labels in mixed exports', () => {
      const viewingKey = 'ab'.repeat(96);
      const state: ViewerExportState = {
        batch: true,
        mode: 'mixed',
        network: 'mainnet',
        items: [],
        errors: [{
          id: 'query-7',
          label: `7 · ORCHARD · ${viewingKey.slice(0, 16)}…${viewingKey.slice(-16)}`,
          message: 'Invalid viewing key.',
          mode: 'shielded',
        }],
      };

      for (const format of ['csv', 'json'] as const) {
        const exported = createViewerExport(state, format, generatedAt);
        expect(exported.text).toContain('7 · ORCHARD · viewing key');
        expect(exported.text).not.toContain(viewingKey.slice(0, 16));
        expect(exported.text).not.toContain(viewingKey.slice(-16));
      }
  });

  it('exports mixed batches as separate Excel worksheets without losing exact integers', async () => {
    const core: ViewerSingleExportState = {
      mode: 'core',
      network: 'mainnet',
      snapshot: {
        kind: 'core', provider: 'DashScan', address: '=Xunsafe', network: 'mainnet',
        balanceDuffs: 9_007_199_254_740_993n, unconfirmedDuffs: 0n,
        totalReceivedDuffs: 9_007_199_254_740_993n, totalSentDuffs: 0n,
        transactionCount: 0, transactions: [], historyLimit: 20, endpoint: 'https://example.invalid',
        indexStatus: 'ok', indexedHeight: 10, indexedTimeMs: generatedAt.getTime(), requests: 2,
      },
    };
    const identity: ViewerSingleExportState = {
      mode: 'identity',
      network: 'mainnet',
      snapshot: {
        kind: 'identity',
        network: 'mainnet',
        inputKind: 'dpns-name',
        inputLabel: 'alice.dash',
        publicKeyHashHex: null,
        resolvedDpnsName: 'alice.dash',
        resolvedDpnsDocumentId: null,
        resolvedRegistrationTransactionHash: null,
        proofs: [],
        requests: 1,
        identities: [],
      },
      histories: [],
    };
    const shielded: ViewerSingleExportState = {
      mode: 'shielded',
      network: 'mainnet',
      snapshot: {
        records: [], scannedNotes: 25n, proofHeight: 12n, protocolVersion: 13,
        complete: true, keyKind: 'full', balance: 0n, receivedExternal: 0n,
        sentExternal: 0n, selfOrChange: 0n,
      },
    };
    const viewingKey = 'ab'.repeat(96);
    const state: ViewerExportState = {
      batch: true,
      mode: 'mixed',
      network: 'mainnet',
      items: [
        { id: 'query-1', label: '1 · CORE · =Xunsafe', state: core },
        { id: 'query-2', label: '2 · IDENTITY · alice.dash', state: identity },
        { id: 'query-3', label: `3 · ORCHARD · ${viewingKey}`, state: shielded },
      ],
      errors: [{
        id: 'query-4',
        label: `4 · ORCHARD · ${viewingKey}`,
        message: `Invalid viewing key ${viewingKey}`,
        mode: 'shielded',
      }],
    };

    const result = await createViewerWorkbookExport(state, generatedAt);
    expect(result.filename).toBe('wallet-activity-viewer-mixed-batch-mainnet-20260901T213000Z.xlsx');
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const xml = Object.entries(files)
      .filter(([name]) => name.endsWith('.xml'))
      .map(([, bytes]) => strFromU8(bytes))
      .join('\n');
    expect(xml).toContain('name="Summary"');
    expect(xml).toContain('name="Addresses"');
    expect(xml).toContain('name="Identities"');
    expect(xml).toContain('name="Orchard"');
    expect(xml).toContain('name="Errors"');
    expect(xml).toContain('=Xunsafe');
    expect(xml).not.toContain('<f>');
    expect(xml).toContain('9007199254740993');
    expect(xml).toContain('not_found');
    expect(xml).toContain('3 · ORCHARD · FULL viewing key');
    expect(xml).toContain('4 · ORCHARD · viewing key');
    expect(xml).toContain('Orchard lookup failed. Viewing-key input is omitted from exports.');
    expect(xml).not.toContain(viewingKey);
  });

  it('creates a focused workbook for a single result', async () => {
    const state: ViewerExportState = {
      mode: 'core',
      network: 'mainnet',
      snapshot: {
        kind: 'core', provider: 'DashScan', address: 'Xsingle', network: 'mainnet',
        balanceDuffs: 1n, unconfirmedDuffs: 0n, totalReceivedDuffs: 1n, totalSentDuffs: 0n,
        transactionCount: 0, transactions: [], historyLimit: 20, endpoint: 'https://example.invalid',
        indexStatus: 'ok', indexedHeight: 10, indexedTimeMs: generatedAt.getTime(), requests: 2,
      },
    };

    const result = await createViewerWorkbookExport(state, generatedAt);
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const xml = Object.entries(files)
      .filter(([name]) => name.endsWith('.xml'))
      .map(([, bytes]) => strFromU8(bytes))
      .join('\n');
    expect(xml).toContain('name="Summary"');
    expect(xml).toContain('name="Addresses"');
    expect(xml).not.toContain('name="Identities"');
    expect(xml).not.toContain('name="Orchard"');
    expect(xml).not.toContain('name="Errors"');
  });

  it('redacts Orchard-only batch failures even when an error has no explicit mode', async () => {
    const viewingKey = 'cd'.repeat(96);
    const state: ViewerExportState = {
      batch: true,
      mode: 'shielded',
      network: 'mainnet',
      items: [],
      errors: [{
        id: 'query-1',
        label: `1 · ${viewingKey}`,
        message: `Invalid viewing key ${viewingKey}`,
      }],
    };

    const result = await createViewerWorkbookExport(state, generatedAt);
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const xml = Object.entries(files)
      .filter(([name]) => name.endsWith('.xml'))
      .map(([, bytes]) => strFromU8(bytes))
      .join('\n');
    expect(xml).toContain('1 · ORCHARD · viewing key');
    expect(xml).not.toContain(viewingKey);
  });
});
