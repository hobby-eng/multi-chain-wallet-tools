import { describe, expect, it, vi } from 'vitest';
import {
  dashDecimalToDuffs,
  queryCoreAddress,
  validateCoreAddress,
  validateCoreP2pkhAddress,
  validatePlatformAddress,
  validatePlatformP2pkhAddress,
} from '../src/public-address.js';
import { bech32m } from '@scure/base';
import { concatBytes, encodeP2sh } from '@ckd/core/crypto.js';

const CORE_ADDRESS = 'XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5';
const PLATFORM_ADDRESS = 'dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs';

describe('public Dash address viewer', () => {
  it('validates network-bound Core and Platform address encodings', () => {
    expect(validateCoreAddress(CORE_ADDRESS, 'mainnet')).toBe(CORE_ADDRESS);
    expect(() => validateCoreAddress(CORE_ADDRESS, 'testnet')).toThrow(/testnet/u);
    expect(validatePlatformAddress(PLATFORM_ADDRESS, 'mainnet')).toBe(PLATFORM_ADDRESS);
    expect(() => validatePlatformAddress(PLATFORM_ADDRESS, 'testnet')).toThrow(/testnet/u);
  });

  it('lets the recovery broker accept only locally derivable P2PKH classes', () => {
    expect(validateCoreP2pkhAddress(CORE_ADDRESS, 'mainnet')).toBe(CORE_ADDRESS);
    const coreP2sh = encodeP2sh(new Uint8Array(20), 16);
    expect(validateCoreAddress(coreP2sh, 'mainnet')).toBe(coreP2sh);
    expect(() => validateCoreP2pkhAddress(coreP2sh, 'mainnet')).toThrow(/P2PKH/u);

    expect(validatePlatformP2pkhAddress(PLATFORM_ADDRESS, 'mainnet')).toBe(PLATFORM_ADDRESS);
    const platformP2sh = bech32m.encode('dash', bech32m.toWords(concatBytes(Uint8Array.of(0x80), new Uint8Array(20))));
    expect(validatePlatformAddress(platformP2sh, 'mainnet')).toBe(platformP2sh);
    expect(() => validatePlatformP2pkhAddress(platformP2sh, 'mainnet')).toThrow(/P2PKH/u);
  });

  it('converts decimal DASH amounts without floating-point arithmetic', () => {
    expect(dashDecimalToDuffs('12.34000001')).toBe(1_234_000_001n);
    expect(dashDecimalToDuffs('-0.00000001')).toBe(-1n);
    expect(dashDecimalToDuffs('not-an-amount')).toBe(0n);
  });

  it('checks DashScan freshness, loads exact-duff totals, and computes transaction flow', async () => {
    const fetcher = vi.fn(async (url: string) => {
      let body: unknown;
      if (url.endsWith('/status')) body = { status: 'ok' };
      else if (url.includes('/blocks?')) {
        body = {
          resultSet: [{ height: 2_531_735, timestamp: '2026-09-01T19:54:32.000Z' }],
          pagination: { page: 1, limit: 1, total: 1_482_434 },
        };
      } else if (url.includes('/transactions?')) {
        body = {
          resultSet: [{
            hash: 'ab'.repeat(32),
            type: 'CLASSIC',
            blockHeight: 2_531_700,
            confirmations: 36,
            timestamp: '2026-09-01T18:54:00.000Z',
            instantLock: '01',
            chainLocked: true,
            blockHash: 'cd'.repeat(32),
            vIn: [
              { address: CORE_ADDRESS, amount: '200' },
              { address: 'Xother', amount: '900' },
            ],
            vOut: [{ value: 1_000, address: CORE_ADDRESS, addresses: [CORE_ADDRESS] }],
          }],
          pagination: { page: 1, limit: 1, total: 1 },
        };
      } else {
        body = {
          balance: '810',
          received: '1000',
          sent: '200',
          txCount: 1,
        };
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const snapshot = await queryCoreAddress(CORE_ADDRESS, 'mainnet', 20, undefined, fetcher);
    expect(snapshot.provider).toBe('DashScan');
    expect(snapshot.balanceDuffs).toBe(810n);
    expect(snapshot.unconfirmedDuffs).toBe(10n);
    expect(snapshot.totalReceivedDuffs).toBe(1_000n);
    expect(snapshot.totalSentDuffs).toBe(200n);
    expect(snapshot.indexedHeight).toBe(2_531_735);
    expect(snapshot.indexedTimeMs).toBe(Date.parse('2026-09-01T19:54:32.000Z'));
    expect(snapshot.requests).toBe(4);
    expect(snapshot.transactions).toHaveLength(1);
    expect(snapshot.transactions[0]).toMatchObject({
      receivedDuffs: 1_000n,
      spentInputDuffs: 200n,
      netDuffs: 800n,
      feeDuffs: 100n,
      confirmations: 36,
      instantLocked: true,
      chainLocked: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('fails closed when DashScan reports an unsynchronized index', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 'syncing' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    await expect(queryCoreAddress(CORE_ADDRESS, 'mainnet', 20, undefined, fetcher)).rejects.toThrow(/not synchronized/u);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
