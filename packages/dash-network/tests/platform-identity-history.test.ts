import { describe, expect, it, vi } from 'vitest';
import { queryPlatformIdentityHistory } from '../src/platform-identity-history.js';

const identityId = 'HhNWsiTQfpJwnqenTFVUG8JqNwAeccWmAYW2vjEvNNXY';
const hash = 'A'.repeat(64);

function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Platform Identity Explorer history', () => {
  it('merges owner transactions and all transfer legs by transaction hash', async () => {
    const fetcher = vi.fn(async (input: string) => {
      if (input.endsWith('/status')) {
        return response({
          network: 'evo1',
          indexer: { status: 'synced' },
          api: { block: { height: 100, timestamp: '2026-09-05T00:00:00.000Z' } },
        });
      }
      if (input.endsWith(`/identity/${identityId}`)) {
        return response({
          identifier: identityId,
          owner: identityId,
          revision: '2',
          balance: '9007199254740993',
          nonce: '7',
          timestamp: '2026-09-01T00:00:00.000Z',
          txHash: hash,
          fundingCoreTx: 'B'.repeat(64),
          isSystem: false,
          aliases: [{
            alias: 'alice.dash',
            status: 'ok',
            contested: false,
            timestamp: '2026-09-01T00:01:00.000Z',
            txHash: 'C'.repeat(64),
          }],
          totalTxs: 1,
          totalTransfers: 2,
          totalDocuments: 1,
          totalDataContracts: 1,
          totalGasSpent: '40',
          averageGasSpent: '40',
          totalTopUps: 1,
          totalTopUpsAmount: '100',
          totalWithdrawals: 0,
          totalWithdrawalsAmount: '0',
          lastWithdrawalHash: null,
          lastWithdrawalTimestamp: null,
        });
      }
      if (input.includes('/transactions?')) {
        return response({
          resultSet: [{
            hash,
            type: 'IDENTITY_CREDIT_TRANSFER',
            batchType: null,
            status: 'SUCCESS',
            error: null,
            timestamp: '2026-09-02T00:00:00.000Z',
            blockHeight: 99,
            blockHash: 'D'.repeat(64),
            gasUsed: '40',
          }],
          pagination: { page: 1, limit: 10, total: 1 },
        });
      }
      if (input.includes('/transfers?')) {
        return response({
          resultSet: [
            {
              txHash: hash,
              type: 'IDENTITY_CREDIT_TRANSFER',
              amount: '70',
              sender: identityId,
              recipient: '7Abgap7TqGRJo1fNVbNEWkUzb9BcjPNL4mYjWrxh2gws',
              timestamp: '2026-09-02T00:00:00.000Z',
              blockHash: 'D'.repeat(64),
              gasUsed: '40',
            },
            {
              txHash: hash,
              type: 'IDENTITY_CREDIT_TRANSFER',
              amount: '20',
              sender: '7Abgap7TqGRJo1fNVbNEWkUzb9BcjPNL4mYjWrxh2gws',
              recipient: identityId,
              timestamp: '2026-09-02T00:00:00.000Z',
              blockHash: 'D'.repeat(64),
              gasUsed: '40',
            },
          ],
          pagination: { page: 1, limit: 10, total: 2 },
        });
      }
      if (input.includes('/documents?')) {
        return response({
          resultSet: [{
            identifier: 'Doc11111111111111111111111111111111111111111',
            dataContractIdentifier: 'Contract11111111111111111111111111111111111',
            documentTypeName: 'domain',
            revision: 1,
            txHash: 'E'.repeat(64),
            timestamp: '2026-09-03T00:00:00.000Z',
            deleted: false,
            system: false,
          }],
          pagination: { page: 1, limit: 10, total: 1 },
        });
      }
      if (input.includes('/dataContracts?')) {
        return response({ resultSet: [], pagination: { page: 1, limit: 10, total: -1 } });
      }
      if (input.includes('/tokens?')) {
        return response({ resultSet: [], pagination: { page: 1, limit: 10, total: -1 } });
      }
      if (input.includes('/withdrawals?')) {
        return response({ resultSet: [], pagination: { page: null, limit: null, total: -1 } });
      }
      throw new Error(`Unexpected URL: ${input}`);
    });

    const snapshot = await queryPlatformIdentityHistory(identityId, 'mainnet', 10, undefined, fetcher);

    expect(snapshot.explorerBalanceCredits).toBe(9_007_199_254_740_993n);
    expect(snapshot.aliases).toMatchObject([{ name: 'alice.dash', status: 'ok' }]);
    expect(snapshot.documents).toHaveLength(1);
    expect(snapshot.activity).toHaveLength(1);
    expect(snapshot.activity[0]).toMatchObject({
      transactionHash: hash,
      status: 'SUCCESS',
      direction: 'self',
      netAmountCredits: -50n,
    });
    expect(snapshot.activity[0]?.transfers).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(8);
  });

  it('uses the Identity creation transition for registration and decodes its Core outpoint', async () => {
    const createHash = '1'.repeat(64);
    const updateHash = '2'.repeat(64);
    const fundingHash = '3'.repeat(64);
    const fetcher = vi.fn(async (input: string) => {
      if (input.endsWith('/status')) {
        return response({
          network: 'evo1',
          indexer: { status: 'synced' },
          api: { block: { height: 100, timestamp: '2026-09-05T00:00:00.000Z' } },
        });
      }
      if (input.endsWith(`/identity/${identityId}`)) {
        return response({
          identifier: identityId,
          owner: identityId,
          revision: '2',
          balance: '1000',
          nonce: '1',
          timestamp: '2026-09-04T00:00:00.000Z',
          txHash: updateHash,
          fundingCoreTx: null,
          isSystem: false,
          aliases: [],
          totalTxs: 2,
          totalTransfers: 0,
          totalDocuments: 0,
          totalDataContracts: 0,
          totalGasSpent: '10',
          averageGasSpent: '5',
          totalTopUps: 0,
          totalTopUpsAmount: '0',
          totalWithdrawals: 0,
          totalWithdrawalsAmount: '0',
          lastWithdrawalHash: null,
          lastWithdrawalTimestamp: null,
        });
      }
      if (input.includes('/transactions?')) {
        const oldestFirst = input.includes('order=asc');
        return response({
          resultSet: oldestFirst
            ? [{
              hash: createHash,
              type: 'IDENTITY_CREATE',
              timestamp: '2025-10-27T16:08:30.236Z',
              blockHeight: 10,
              data: 'public-create-transition',
            }]
            : [{
              hash: updateHash,
              type: 'IDENTITY_UPDATE',
              timestamp: '2026-09-04T00:00:00.000Z',
              blockHeight: 99,
            }],
          pagination: { page: 1, limit: 1, total: 2 },
        });
      }
      if (input.includes('/withdrawals?')) {
        return response({ resultSet: [], pagination: { page: null, limit: null, total: 0 } });
      }
      if (
        input.includes('/transfers?')
        || input.includes('/documents?')
        || input.includes('/dataContracts?')
        || input.includes('/tokens?')
      ) {
        return response({ resultSet: [], pagination: { page: 1, limit: 10, total: 0 } });
      }
      throw new Error(`Unexpected URL: ${input}`);
    });
    const fundingDecoder = vi.fn(() => ({
      coreTransactionHash: fundingHash,
      outputIndex: 2,
      lockType: 'instant' as const,
    }));

    const snapshot = await queryPlatformIdentityHistory(
      identityId,
      'mainnet',
      1,
      undefined,
      fetcher,
      undefined,
      fundingDecoder,
    );

    expect(snapshot.registeredAtMs).toBe(Date.parse('2025-10-27T16:08:30.236Z'));
    expect(snapshot.registrationType).toBe('IDENTITY_CREATE');
    expect(snapshot.registrationTransactionHash).toBe(createHash);
    expect(snapshot.registrationFundingSource).toBe('core-asset-lock');
    expect(snapshot.fundingCoreTransactionHash).toBe(fundingHash);
    expect(snapshot.fundingCoreTransactionOutputIndex).toBe(2);
    expect(snapshot.fundingCoreTransactionError).toBeNull();
    expect(fundingDecoder).toHaveBeenCalledWith('public-create-transition');
  });
});
