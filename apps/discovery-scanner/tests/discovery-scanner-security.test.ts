import { mnemonicToSeed } from '@ckd/core/bip39.js';
import type { ShieldedActivity } from '@ckd/dash-network/types.js';
import { mapRecoveryTasks, RecoveryConcurrencyLimiter } from '../src/concurrency.js';
import { scanDashCore } from '../src/coins/dash/core-scanner.js';
import type { DashPlatformClient } from '../src/coins/dash/platform-client.js';
import { scanDashPlatformAddresses } from '../src/coins/dash/platform-scanner.js';
import { shouldDisplayShieldedActivity } from '../src/coins/dash/shielded-filter.js';
import {
  advanceShieldedStream,
  initialShieldedStreamCursor,
  isTerminalShieldedPage,
  runShieldedPageStream,
  SHIELDED_MAX_PAGES_PER_SCAN,
  SHIELDED_PAGE_SIZE,
} from '@ckd/dash-network/shielded-stream-policy.js';
import { extendAddressTarget } from '../src/coins/dash/util.js';
import { createRecoveryExport } from '../src/export.js';
import { RecoveryNetworkGateway } from '../src/network-gateway.js';
import type { RecoveryNetworkApi } from '../src/network-protocol.js';
import {
  DirectRecoveryNetworkService,
  executeRecoveryNetworkRequest,
} from '../src/network-service.js';
import { describeUnknownError } from '../src/error-message.js';
import { SecretEgressGuard } from '../src/secret-guard.js';
import type { RecoveryScanConfig, RecoveryWalletResult } from '../src/types.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function mockNetwork(overrides: Partial<RecoveryNetworkApi> = {}): RecoveryNetworkApi {
  const unavailable = async (): Promise<never> => { throw new Error('Unexpected mock network operation.'); };
  return {
    ping: async () => 'isolated-network-worker-v1',
    coreStatus: unavailable,
    coreTip: unavailable,
    coreAddressInfo: unavailable,
    coreAddressHistory: unavailable,
    platformAddresses: unavailable,
    platformAddressHistory: unavailable,
    platformIdentityByPublicKeyHash: unavailable,
    platformIdentityHistory: unavailable,
    shieldedPage: unavailable,
    ...overrides,
  };
}

describe('recovery secret boundary', () => {
  it('rejects malformed public inputs and unsupported RPC operations before network access', async () => {
    const service = new DirectRecoveryNetworkService();
    await expect(service.coreAddressInfo('mainnet', ['not-a-dash-address'])).rejects.toThrow(/invalid Dash Core/u);
    await expect(service.coreAddressInfo('mainnet', Array(51).fill('XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5'))).rejects.toThrow(/1 to 50/u);
    await expect(service.platformAddresses('mainnet', ['dash1invalid'])).rejects.toThrow(/invalid Dash Platform/u);
    await expect(service.platformIdentityByPublicKeyHash('mainnet', 'AA')).rejects.toThrow(/20-byte lowercase/u);
    await expect(service.shieldedPage('mainnet', '-1', 2048)).rejects.toThrow(/pool position/u);
    await expect(executeRecoveryNetworkRequest(
      mockNetwork(),
      { id: 'forbidden', operation: 'fetch-url', payload: { url: 'https://example.invalid' } } as never,
    )).rejects.toThrow(/unsupported operation/u);
  });

  it('recovers a missing DashScan first-seen timestamp from its first transaction', async () => {
    const responses = [
      {
        address: 'XoB13GVVfCpKBkRhLPLaw6P6L1jRzCo6hz',
        firstSeenBlockTimestamp: null,
        firstSeenTx: '89a152257dd9780823e2a544a9deceb2588db9a9a0788e6be2e0c7fab871a87a',
        lastSeenBlockTimestamp: '2026-09-01T15:56:31.000Z',
      },
      {
        hash: '89a152257dd9780823e2a544a9deceb2588db9a9a0788e6be2e0c7fab871a87a',
        timestamp: '2026-09-01T15:56:31.000Z',
      },
    ];
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetcher);
    const value = await new DirectRecoveryNetworkService().coreAddressHistory(
      'mainnet',
      'XoB13GVVfCpKBkRhLPLaw6P6L1jRzCo6hz',
    ) as Record<string, unknown>;
    expect(value.firstSeenBlockTimestamp).toBe('2026-09-01T15:56:31.000Z');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toContain('/transaction/89a152257dd9780823e2a544a9deceb2588db9a9a0788e6be2e0c7fab871a87a');
  });

  it('loads synchronized Platform address history with exact totals', async () => {
    const address = 'dash1kzqsm4rvknh475pf7nqzy8ddyd42y39t4ujjl6ee';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith('/status')
        ? { network: 'dash', indexer: { status: 'synced' }, api: { block: { height: 500_001 } } }
        : url.endsWith('/info')
          ? { bech32mAddress: address, balance: '1000', totalTxs: 3, incomingTxs: 2, outgoingTxs: 1, totalIncomingAmount: '2500', totalOutgoingAmount: '1500' }
          : { resultSet: [{ timestamp: url.includes('order=asc') ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z' }], pagination: { total: 3 } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    await expect(new DirectRecoveryNetworkService().platformAddressHistory('mainnet', address)).resolves.toMatchObject({
      resource: address,
      balance: '1000',
      transactionCount: 3,
      incomingCount: 2,
      outgoingCount: 1,
      totalReceived: '2500',
      totalSent: '1500',
      indexedHeight: 500_001,
    });
  });

  it('aggregates Platform identity transfers separately from fees', async () => {
    const identifier = 'AAQQBHYeZsnZRVbNFegRSRA8dBRHiiTxN4sgCsaU9VWu';
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let body: unknown;
      if (url.endsWith('/status')) body = { network: 'dash', indexer: { status: 'synced' }, api: { block: { height: 500_002 } } };
      else if (url.includes('/transactions')) body = { resultSet: [{ timestamp: '2026-02-03T00:00:00.000Z' }], pagination: { total: 4 } };
      else if (url.includes('/transfers')) body = {
        resultSet: [
          { recipient: identifier, sender: 'BBQQBHYeZsnZRVbNFegRSRA8dBRHiiTxN4sgCsaU9VWu', amount: '900' },
          { recipient: 'CCQQBHYeZsnZRVbNFegRSRA8dBRHiiTxN4sgCsaU9VWu', sender: identifier, amount: '300' },
        ],
        pagination: { total: 2 },
      };
      else body = { identifier, balance: '500', totalTxs: 4, totalGasSpent: '100', timestamp: '2026-02-01T00:00:00.000Z' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    await expect(new DirectRecoveryNetworkService().platformIdentityHistory('mainnet', identifier)).resolves.toMatchObject({
      resource: identifier,
      balance: '500',
      transactionCount: 4,
      incomingCount: 1,
      outgoingCount: 1,
      totalReceived: '900',
      totalSent: '300',
      totalFees: '100',
      firstSeen: '2026-02-01T00:00:00.000Z',
      lastSeen: '2026-02-03T00:00:00.000Z',
    });
  });

  it('blocks raw, compact, and byte-encoded secrets while allowing public addresses', () => {
    const guard = new SecretEgressGuard();
    guard.registerString('mnemonic', MNEMONIC);
    guard.registerString('passphrase', 'correct horse');
    guard.registerBytes('seed', new Uint8Array(32).fill(0x42));
    expect(() => guard.assertPublic({ address: 'XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5' }, 'query')).not.toThrow();
    expect(() => guard.assertPublic({ body: MNEMONIC }, 'query')).toThrow(/mnemonic/u);
    expect(() => guard.assertPublic({ body: MNEMONIC.replaceAll(' ', '') }, 'query')).toThrow(/compact/u);
    expect(() => guard.assertPublic({ url: `https://example.invalid/${'42'.repeat(32)}` }, 'query')).toThrow(/seed/u);
    expect(() => guard.assertPublic({ passphrase: 'correct horse' }, 'query')).toThrow(/passphrase/u);
  });

  it('blocks a secret that leaves under a transport encoding', () => {
    const guard = new SecretEgressGuard();
    guard.registerString('mnemonic', MNEMONIC);
    guard.registerBytes('seed', new Uint8Array(32).fill(0x42));
    // Each payload carries the phrase in exactly one field and one encoding, so
    // a gap in a single detection path cannot be masked by another field.
    expect(() => guard.assertPublic(
      { url: `https://example.invalid/?q=${encodeURIComponent(MNEMONIC)}` },
      'query',
    )).toThrow(/mnemonic/u);
    expect(() => guard.assertPublic({ body: btoa(MNEMONIC) }, 'query')).toThrow(/mnemonic/u);
    expect(() => guard.assertPublic({ body: MNEMONIC.replaceAll(' ', '-') }, 'query')).toThrow(/mnemonic/u);
    expect(() => guard.assertPublic({ body: MNEMONIC.replaceAll(' ', '\n') }, 'query')).toThrow(/mnemonic/u);
  });

  it('does not flag ordinary public request material', () => {
    const guard = new SecretEgressGuard();
    guard.registerString('mnemonic', MNEMONIC);
    guard.registerString('passphrase', 'correct horse');
    guard.registerBytes('seed', new Uint8Array(32).fill(0x42));
    for (const payload of [
      { url: 'https://dashscan.pshenmic.dev/addresses/info?addresses=XoJA8qE3N2Y3jMLEtZ3vcN42qseZ8LvFf5' },
      { url: 'https://platform-explorer.pshenmic.dev/platformAddress/dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs/info' },
      { startPosition: '0', count: 2048 },
      { publicKeyHash: 'a'.repeat(40) },
    ]) {
      expect(() => guard.assertPublic(payload, 'query')).not.toThrow();
    }
  });

  it('checks every public RPC payload before invoking the isolated network client', async () => {
    const guard = new SecretEgressGuard();
    guard.registerString('mnemonic', MNEMONIC);
    let calls = 0;
    const networkApi = mockNetwork({ ping: async () => { calls += 1; return 'isolated-network-worker-v1'; } });
    const gateway = new RecoveryNetworkGateway(guard, networkApi);
    await expect(gateway.runPublic({ operation: 'ping' }, 'ping', () => networkApi.ping())).resolves.toBe('isolated-network-worker-v1');
    await expect(gateway.runPublic({ body: MNEMONIC }, 'leak', () => networkApi.ping())).rejects.toThrow(/Blocked/u);
    expect(calls).toBe(1);
    expect(gateway.operationStats(['ping']).count).toBe(1);
  });

  it('does not expose a direct fetch method inside the Secret Vault gateway', async () => {
    const guard = new SecretEgressGuard();
    const gateway = new RecoveryNetworkGateway(guard, mockNetwork());
    expect('fetchJson' in gateway).toBe(false);
    expect('fetcher' in gateway).toBe(false);
    await expect(gateway.networkApi.ping()).resolves.toBe('isolated-network-worker-v1');
  });

});

describe('streamed Core recovery scan', () => {
  it('derives and queries branch-bounded chunks without transmitting the seed', async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const guard = new SecretEgressGuard();
    guard.registerString('mnemonic', MNEMONIC);
    guard.registerBytes('seed', seed);
    let addressBatches = 0;
    const requestedAddresses: string[] = [];
    const networkApi = mockNetwork({
      coreStatus: async () => ({ status: 'ok' }),
      coreTip: async () => ({ resultSet: [{ height: 2_300_000, timestamp: '2026-09-02T00:00:00.000Z' }] }),
      coreAddressInfo: async (_network, addresses) => {
        addressBatches += 1;
        const batchStart = requestedAddresses.length;
        requestedAddresses.push(...addresses);
        return addresses.map((address, index) => ({
          address,
          balance: batchStart + index === 0 || batchStart + index === 201 ? '100000000' : '0',
          txCount: batchStart + index === 0 || batchStart + index === 201 ? 1 : 0,
        }));
      },
    });
    const gateway = new RecoveryNetworkGateway(guard, networkApi);
    const config: RecoveryScanConfig = {
      network: 'testnet', account: 0,
      scanCore: true, scanPlatformAddresses: false, scanPlatformIdentities: false,
      coreReceiveCount: 201, coreChangeCount: 101, platformAddressCount: 0,
      identityStartIndex: 0, identityGapLimit: 1, identityScanLimit: 1,
      includeUsedZeroBalance: false,
      scanShieldedPool: false,
    };
    const progress: number[] = [];
    const findings: string[] = [];
    try {
      const section = await scanDashCore('seed-1', seed, config, gateway, new AbortController().signal,
        (value) => progress.push(value.completed),
        (finding) => findings.push(finding.title));
      expect(section.scanned).toBe(302);
      expect(addressBatches).toBe(8);
      expect(requestedAddresses).toHaveLength(302);
      expect(new Set(requestedAddresses).size).toBe(302);
      expect(progress.at(-1)).toBe(302);
      expect(findings).toHaveLength(2);
      expect(section.metrics[0]?.value).toBe('2 DASH');
      expect(gateway.requestCount).toBe(12);
    } finally {
      seed.fill(0);
    }
  });
});

describe('Orchard stream completion', () => {
  it('uses chunk-aligned positions and requires two empty confirmations', () => {
    expect(isTerminalShieldedPage(0)).toBe(true);
    expect(isTerminalShieldedPage(1)).toBe(false);
    expect(isTerminalShieldedPage(2047)).toBe(false);
    expect(isTerminalShieldedPage(2048)).toBe(false);
    expect(() => isTerminalShieldedPage(2049)).toThrow(/outside the reviewed range/u);
    const short = advanceShieldedStream(initialShieldedStreamCursor(), 1634);
    expect(short).toMatchObject({ position: BigInt(SHIELDED_PAGE_SIZE), decision: 'continue', consecutiveEmpty: 0 });
    const emptyOnce = advanceShieldedStream(short, 0);
    expect(emptyOnce).toMatchObject({ position: BigInt(SHIELDED_PAGE_SIZE), decision: 'continue', consecutiveEmpty: 1 });
    expect(advanceShieldedStream(emptyOnce, 0)).toMatchObject({ decision: 'complete', consecutiveEmpty: 2 });
  });

  it('turns an unterminated provider stream into a partial ceiling result', () => {
    const nearLimit = {
      position: BigInt((SHIELDED_MAX_PAGES_PER_SCAN - 1) * SHIELDED_PAGE_SIZE),
      pageCount: SHIELDED_MAX_PAGES_PER_SCAN - 1,
      consecutiveEmpty: 0,
    };
    expect(advanceShieldedStream(nearLimit, SHIELDED_PAGE_SIZE)).toMatchObject({ decision: 'limit' });
  });

  it('drives short, successor, and repeated-empty pages at aligned positions', async () => {
    const counts = [1634, 2, 0, 0];
    const requested: bigint[] = [];
    const visited: Array<{ position: bigint; count: number; emptyConfirmation: number }> = [];
    const disposed: number[] = [];
    const outcome = await runShieldedPageStream({
      fetchPage: async (position) => {
        requested.push(position);
        return { count: counts.shift() ?? 0 };
      },
      noteCount: (page) => page.count,
      onPage: (page, visit) => {
        visited.push({ position: visit.position, count: page.count, emptyConfirmation: visit.emptyConfirmation });
      },
      disposePage: (page) => disposed.push(page.count),
    });
    expect(requested).toEqual([0n, 2048n, 4096n, 4096n]);
    expect(visited.map(({ emptyConfirmation }) => emptyConfirmation)).toEqual([0, 0, 1, 2]);
    expect(disposed).toEqual([1634, 2, 0, 0]);
    expect(outcome).toEqual({ complete: true, pageCount: 4, terminalPosition: 4096n });
  });
});

describe('structured recovery diagnostics', () => {
  it('extracts wasm-bindgen object getters instead of rendering [object Object]', () => {
    const cause = Object.create({
      get name() { return 'DapiClientError'; },
      get message() { return 'grpc invalid argument'; },
      get code() { return -1; },
      get kind() { return 7; },
    });
    expect(describeUnknownError(cause)).toBe('name: DapiClientError · grpc invalid argument · code: -1 · kind: 7');
  });
});

describe('dynamic recovery discovery gap and history filter', () => {
  it('keeps scanning 20 positions past used addresses even when an empty historical row is hidden', async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const guard = new SecretEgressGuard();
    guard.registerBytes('seed', seed);
    let derivedOffset = 0;
    let fundedHistoryCalls = 0;
    const networkApi = mockNetwork({
      coreStatus: async () => ({ status: 'ok' }),
      coreTip: async () => ({ resultSet: [{ height: 1 }] }),
      coreAddressInfo: async (_network, addresses) => {
        const start = derivedOffset;
        derivedOffset += addresses.length;
        return addresses.map((address, offset) => {
          const index = start + offset;
          return {
            address,
            balance: index === 99 ? '100000000' : '0',
            txCount: index === 99 || index === 119 ? 1 : 0,
          };
        });
      },
      coreAddressHistory: async (_network, address) => {
        fundedHistoryCalls += 1;
        return {
          address, txCount: 1, received: '100000000', sent: '0',
          firstSeenBlockTimestamp: '2025-03-01T00:00:00.000Z', lastSeenBlockTimestamp: '2025-03-01T00:00:00.000Z',
        };
      },
    });
    const gateway = new RecoveryNetworkGateway(guard, networkApi);
    const config: RecoveryScanConfig = {
      network: 'testnet', account: 0,
      scanCore: true, scanPlatformAddresses: false, scanPlatformIdentities: false,
      coreReceiveCount: 100, coreChangeCount: 0, platformAddressCount: 0,
      identityStartIndex: 0, identityGapLimit: 1, identityScanLimit: 1,
      includeUsedZeroBalance: false, scanShieldedPool: false,
    };
    try {
      const section = await scanDashCore('gap', seed, config, gateway, new AbortController().signal, () => {}, () => {});
      expect(section.scanned).toBe(140);
      expect(section.findings).toHaveLength(1);
      expect(fundedHistoryCalls).toBe(1);
      expect(section.findings[0]?.subtitle).toBe('Receive address #99');
      expect(section.findings[0]?.fields).toContainEqual({ label: 'First seen', value: '2025-03-01T00:00:00.000Z' });
      expect(section.metrics.find(({ label }) => label === 'Previously used · empty')?.value).toBe('1');
    } finally {
      seed.fill(0);
    }
  });

  it('shows and enriches an empty historical address only when requested', async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const guard = new SecretEgressGuard();
    guard.registerBytes('seed', seed);
    let addressInfoCalls = 0;
    const historyAddresses: string[] = [];
    const networkApi = mockNetwork({
      coreStatus: async () => ({ status: 'ok' }),
      coreTip: async () => ({ resultSet: [{ height: 1 }] }),
      coreAddressInfo: async (_network, addresses) => {
        addressInfoCalls += 1;
        return addresses.map((address, index) => ({
          address,
          balance: addressInfoCalls === 1 && index === 1 ? '100000000' : '0',
          txCount: addressInfoCalls === 1 && index < 2 ? 2 : 0,
        }));
      },
      coreAddressHistory: async (_network, address) => {
        historyAddresses.push(address);
        return {
          address, txCount: '2', received: '250000000', sent: '250000000',
          firstSeenBlockTimestamp: '2025-01-01T00:00:00.000Z', lastSeenBlockTimestamp: '2025-02-01T00:00:00.000Z',
        };
      },
    });
    const gateway = new RecoveryNetworkGateway(guard, networkApi);
    const config: RecoveryScanConfig = {
      network: 'testnet', account: 0,
      scanCore: true, scanPlatformAddresses: false, scanPlatformIdentities: false,
      coreReceiveCount: 2, coreChangeCount: 0, platformAddressCount: 0,
      identityStartIndex: 0, identityGapLimit: 1, identityScanLimit: 1,
      includeUsedZeroBalance: true, scanShieldedPool: false,
    };
    try {
      const section = await scanDashCore('history', seed, config, gateway, new AbortController().signal, () => {}, () => {});
      expect(section.scanned).toBe(22);
      expect(section.findings).toHaveLength(2);
      expect(historyAddresses).toHaveLength(2);
      expect(section.findings.some(({ balanceAtomic }) => balanceAtomic > 0n)).toBe(true);
      expect(section.findings[0]?.fields).toContainEqual({ label: 'Lifetime received', value: '2.5 DASH' });
      expect(section.findings[0]?.fields).toContainEqual({ label: 'Lifetime sent', value: '2.5 DASH' });
      expect(section.findings[0]?.fields).toContainEqual({ label: 'First seen', value: '2025-01-01T00:00:00.000Z' });
      expect(section.findings[0]?.fields).toContainEqual({ label: 'Last seen', value: '2025-02-01T00:00:00.000Z' });
    } finally {
      seed.fill(0);
    }
  });

  it('calculates an index-space-bounded 20-address extension', () => {
    expect(extendAddressTarget(100, 99)).toEqual({ target: 120, truncated: false });
    expect(extendAddressTarget(140, 99)).toEqual({ target: 140, truncated: false });
  });
});

describe('bounded recovery concurrency', () => {
  it('preserves result order and never exceeds the configured active limit', async () => {
    const limiter = new RecoveryConcurrencyLimiter(2);
    let maximum = 0;
    const results = await mapRecoveryTasks([30, 5, 10, 1], 4, async (delay, index) => limiter.run(async () => {
      maximum = Math.max(maximum, limiter.active);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      return index;
    }));
    expect(results).toEqual([0, 1, 2, 3]);
    expect(maximum).toBe(2);
  });

  it('removes an aborted queued operation without executing or leaking a slot', async () => {
    const limiter = new RecoveryConcurrencyLimiter(1);
    let releaseFirst: (() => void) | undefined;
    const first = limiter.run(() => new Promise<void>((resolve) => { releaseFirst = resolve; }));
    await Promise.resolve();
    let secondExecuted = false;
    const controller = new AbortController();
    const second = limiter.run(async () => { secondExecuted = true; }, controller.signal);
    controller.abort();
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(secondExecuted).toBe(false);
    expect(limiter.pending).toBe(0);
    if (releaseFirst === undefined) throw new Error('First concurrency test operation did not start.');
    releaseFirst();
    await first;
    expect(limiter.active).toBe(0);
  });

});

describe('Orchard recovery output filter', () => {
  const note = {
    value: 1n,
    addressRaw: '00',
    address: 'dash1ztest',
    memoHex: '',
    memo: '',
    noteNullifier: '11',
  };
  const base = { position: 1n, cmx: '22', actionNullifier: '33' };

  it('shows only spendable incoming notes by default and all activity on opt-in', () => {
    const spendable = { ...base, direction: 'received', incoming: note, spent: false } satisfies ShieldedActivity;
    const spent = { ...base, position: 2n, direction: 'received', incoming: note, spent: true } satisfies ShieldedActivity;
    const outgoing = { ...base, position: 3n, direction: 'sent', outgoing: note } satisfies ShieldedActivity;
    expect(shouldDisplayShieldedActivity(spendable, false)).toBe(true);
    expect(shouldDisplayShieldedActivity(spent, false)).toBe(false);
    expect(shouldDisplayShieldedActivity(outgoing, false)).toBe(false);
    expect([spendable, spent, outgoing].filter((record) => shouldDisplayShieldedActivity(record, true))).toHaveLength(3);
  });
});


describe('proof-verified Platform recovery scan', () => {
  it('matches getManyWithProof results by the internal 00-prefixed storage payload', async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const guard = new SecretEgressGuard();
    guard.registerBytes('seed', seed);
    const gateway = new RecoveryNetworkGateway(guard, mockNetwork());
    const queried: string[][] = [];
    const client = {
      gateway,
      addresses: async (addresses: string[]) => {
        queried.push(addresses);
        return {
          entries: [['00f7da0a2b5cbd4ff6bb2c4d89b67d2f3ffeec0525', { balance: '4990050160', nonce: '2' }]],
          metadata: { height: '426137', coreChainLockedHeight: 2_000_000, protocolVersion: 13, timeMs: '10' },
        };
      },
      addressHistory: async (address: string) => ({
        resource: address,
        balance: '4990050160',
        transactionCount: 3,
        incomingCount: 2,
        outgoingCount: 1,
        totalReceived: '6000000000',
        totalSent: '1009949840',
        totalFees: null,
        firstSeen: '2026-01-01T00:00:00.000Z',
        lastSeen: '2026-02-01T00:00:00.000Z',
        indexedHeight: 426_140,
      }),
    } as unknown as DashPlatformClient;
    const config: RecoveryScanConfig = {
      network: 'mainnet', account: 0,
      scanCore: false, scanPlatformAddresses: true, scanPlatformIdentities: false,
      coreReceiveCount: 1, coreChangeCount: 0, platformAddressCount: 100,
      identityStartIndex: 0, identityGapLimit: 1, identityScanLimit: 1,
      includeUsedZeroBalance: false,
      scanShieldedPool: false,
    };
    try {
      const section = await scanDashPlatformAddresses(
        'seed-1', seed, config, client, new AbortController().signal, () => {}, () => {},
      );
      expect(queried).toHaveLength(1);
      expect(queried[0]?.[0]).toBe('dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs');
      expect(queried[0]).toHaveLength(100);
      expect(section.findings).toHaveLength(1);
      expect(section.findings[0]?.balanceAtomic).toBe(4_990_050_160n);
      expect(section.metrics[0]?.value).toBe('0.0499005016 DASH');
      expect(section.findings[0]?.fields).toContainEqual({ label: 'Lifetime received', value: '0.06 DASH' });
      expect(section.findings[0]?.fields).toContainEqual({ label: 'First seen', value: '2026-01-01T00:00:00.000Z' });
    } finally {
      seed.fill(0);
    }
  });
});

describe('recovery report export', () => {
  const result: RecoveryWalletResult = {
    inputId: 'seed-1', label: '=wallet', coinId: 'dash', coinLabel: 'Dash', network: 'testnet',
    startedAt: '2026-09-02T00:00:00.000Z', completedAt: '2026-09-02T00:01:00.000Z', warnings: [],
    overview: [{ label: 'Total located value', value: '1 DASH', tone: 'positive' }],
    sections: [{
      id: 'core', title: 'Dash Core · L1', description: 'scan', state: 'complete',
      metrics: [{ label: 'Balance', value: '1 DASH' }], scanned: 1, source: 'DashScan', proof: 'height 1',
      findings: [{
        id: 'core:0:0', title: 'Xabc', subtitle: 'Receive address #0', balanceAtomic: 100_000_000n,
        balanceLabel: '1 DASH',
        fields: [
          { label: 'Derivation path', value: "m/44'/1'/0'/0/0", copyable: true },
          { label: 'Branch', value: '0 · receive' },
          { label: 'Address index', value: '0' },
          { label: 'Transactions reported', value: '25' },
          { label: 'Lifetime received', value: '100.98976616 DASH' },
          { label: 'Lifetime sent', value: '99.98976616 DASH' },
          { label: 'First seen', value: '2024-11-02T02:27:28.000Z' },
          { label: 'Last seen', value: '2025-01-12T01:02:29.000Z' },
          { label: 'Public-key hash', value: 'dd8df975f14b643048b09154bf9793779027e188' },
        ],
      }],
    }],
  };

  it('exports only public recovery metadata and serializes exact integers', () => {
    const json = createRecoveryExport([result], 'json', new Date('2026-09-02T00:00:00.000Z'));
    expect(json.text).toContain('"containsSecrets": false');
    expect(json.text).toContain('"balanceAtomic": "100000000"');
    expect(json.text).toContain('"label": "Lifetime received"');
    expect(json.text).toContain('"value": "100.98976616 DASH"');
    expect(json.text).not.toContain('locator');
    expect(json.text).not.toContain(MNEMONIC);
    expect(json.text).not.toMatch(/"(?:mnemonic|privateKey|fullViewingKey)"\s*:/iu);
  });

  it('protects CSV cells from spreadsheet formulas', () => {
    const csv = createRecoveryExport([result], 'csv');
    expect(csv.text).toContain('"\'=wallet"');
    expect(csv.text).toContain('"100000000"');
    expect(csv.text).toContain('"transactions_reported"');
    expect(csv.text).toContain('"balance_dash"');
    expect(csv.text).toContain('"lifetime_received_dash"');
    expect(csv.text).toContain('"first_seen"');
    expect(csv.text).toContain('"public_key_hash"');
    expect(csv.text).not.toContain('"incoming_credit_events"');
    expect(csv.text).not.toContain('"lifetime_fees_spent_dash"');
    expect(csv.text).not.toContain('"note_value_dash"');
    expect(csv.text).not.toContain('"section_lifetime_received_dash"');
    expect(csv.text).toContain('"100.98976616"');
    expect(csv.text).not.toContain('"100.98976616 DASH"');
    expect(csv.text).toContain('"dd8df975f14b643048b09154bf9793779027e188"');
  });

  it('exports Orchard note details and numeric section aggregates to CSV', () => {
    const orchard: RecoveryWalletResult = {
      ...result,
      sections: [{
        id: 'shielded', title: 'Dash Orchard · shielded pool', description: 'scan', state: 'complete',
        scanned: 2n, source: 'DAPI', proof: 'proof height 1',
        metrics: [
          { label: 'Spendable balance', value: '0.25 DASH' },
          { label: 'Lifetime received', value: '0.3 DASH' },
          { label: 'Lifetime sent', value: '0.05 DASH' },
          { label: 'Lifetime self/change', value: '0.01 DASH' },
          { label: 'Incoming notes', value: '2' },
          { label: 'First activity pool position', value: '10' },
          { label: 'Last activity pool position', value: '20' },
        ],
        findings: [{
          id: 'shielded:10', title: 'dash1ztest', subtitle: 'Received · pool position 10',
          balanceAtomic: 25_000_000_000n, balanceLabel: '0.25 DASH',
          fields: [
            { label: 'Pool position', value: '10' },
            { label: 'Direction', value: 'received' },
            { label: 'Note value', value: '0.3 DASH' },
            { label: 'Spend state', value: 'Spent' },
            { label: 'Spent at pool position', value: '20' },
          ],
        }],
      }],
    };
    const csv = createRecoveryExport([orchard], 'csv');
    expect(csv.text).toContain('"note_value_dash"');
    expect(csv.text).toContain('"section_lifetime_received_dash"');
    expect(csv.text).not.toContain('"transactions_reported"');
    expect(csv.text).not.toContain('"first_seen"');
    expect(csv.text).toContain('"0.3"');
    expect(csv.text).not.toContain('"0.3 DASH"');
    expect(csv.text).toContain('"20","received","0.3","Spent"');
  });

  it('applies the session secret tripwire to the finished export text', () => {
    const guard = new SecretEgressGuard();
    guard.registerString('mnemonic', MNEMONIC);
    const clean = createRecoveryExport([result], 'json');
    expect(() => guard.assertPublic(clean.text, 'recovery report export')).not.toThrow();
    const contaminated = createRecoveryExport([{ ...result, warnings: [MNEMONIC] }], 'json');
    expect(() => guard.assertPublic(contaminated.text, 'recovery report export')).toThrow(/Blocked recovery report export/u);
  });
});
