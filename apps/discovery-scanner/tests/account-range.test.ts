import { encodePlatformP2pkh } from '@ckd/coins/dash/platform.js';
import { scanDashPlatformAddresses } from '../src/coins/dash/platform-scanner.js';
import type { DashPlatformClient } from '../src/coins/dash/platform-client.js';
import { describe, expect, it } from 'vitest';
import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { encodeP2pkh, hash160 } from '@ckd/core/crypto.js';
import { accountScanConfigs } from '../src/account-range.js';
import { BITCOIN_RECOVERY_ADAPTER } from '../src/coins/bitcoin/index.js';
import { scanDashCore } from '../src/coins/dash/core-scanner.js';
import { RecoveryNetworkGateway } from '../src/network-gateway.js';
import { SecretEgressGuard } from '../src/secret-guard.js';
import { ETHEREUM_RECOVERY_ADAPTER } from '../src/coins/ethereum/index.js';
import type { RecoveryNetworkApi } from '../src/network-protocol.js';
import type { RecoveryScanConfig } from '../src/types.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Unexpected network operation.'));
}

function api(overrides: Partial<RecoveryNetworkApi>): RecoveryNetworkApi {
  return {
    ping: async () => 'isolated-network-worker-v1',
    coreStatus: unavailable,
    coreTip: unavailable,
    coreAddressInfo: unavailable,
    coreAddressHistory: unavailable,
    coreTransaction: unavailable,
    platformAddresses: unavailable,
    platformAddressHistory: unavailable,
    platformIdentityByPublicKeyHash: unavailable,
    platformIdentityHistory: unavailable,
    shieldedPage: unavailable,
    addressHistory: unavailable, utxoAddresses: unavailable,
    evmAccounts: unavailable,
    ...overrides,
  };
}

const config: RecoveryScanConfig = {
  network: 'mainnet',
  account: 0,
  scanCore: true,
  coreReceiveCount: 1,
  coreChangeCount: 0,
  scanLegacyCore: false,
  legacyCoreCount: 0,
  scanCoinJoin: false,
  coinJoinExternalCount: 0,
  coinJoinInternalCount: 0,
  scanIdentityFunding: false,
  identityFundingCount: 0,
  identityTopUpIdentityCount: 0,
  identityTopUpCount: 0,
  scanProviderCollateral: false,
  providerCollateralCount: 0,
  scanPlatformAddresses: false,
  platformAddressCount: 0,
  scanPlatformIdentities: false,
  identityStartIndex: 0,
  identityGapLimit: 1,
  identityScanLimit: 1,
  includeUsedZeroBalance: false,
  scanShieldedPool: false,
};


describe('optional account ranges', () => {
  it('preserves single-account settings and disabled branches', () => {
    expect([...accountScanConfigs(config, 'dash')]).toEqual([config]);
    const plans = [...accountScanConfigs({ ...config, accountRangeEnd: 2, coreReceiveCount: 100 }, 'dash')];
    expect(plans.map(p => [p.account, p.coreReceiveCount, p.coreChangeCount])).toEqual([[0,120,0],[1,120,0],[2,120,0]]);
  });
  it('checks invariant Dash components and custom paths only once', () => {
    const plans = [...accountScanConfigs({ ...config, account: 4, accountRangeEnd: 5, scanCustomPath: true, scanPlatformIdentities: true, scanIdentityFunding: true, scanProviderCollateral: true, scanShieldedPool: true }, 'dash')];
    expect(plans.map(p => [p.scanCustomPath, p.scanPlatformIdentities, p.scanIdentityFunding, p.scanProviderCollateral, p.scanShieldedPool])).toEqual([[true,true,true,true,true],[false,false,false,false,true]]);
  });
  it('rejects reversed, fractional, overflowing or inapplicable ranges before iteration', () => {
    for (const accountRangeEnd of [-1, 0.5, 2147483648]) expect(() => accountScanConfigs({ ...config, accountRangeEnd }, 'dash')).toThrow();
    expect(() => accountScanConfigs({ ...config, account: 2, accountRangeEnd: 1 }, 'dash')).toThrow(/Last account/);
    expect(() => accountScanConfigs({ ...config, accountRangeEnd: 1, coreReceiveCount: 2147483640 }, 'bitcoin')).toThrow(/margin/);
    expect(() => accountScanConfigs({ ...config, accountRangeEnd: 1, scanCore: false, scanPlatformIdentities: true }, 'dash')).toThrow(/account-based/);
    // An enormous valid range must not allocate a list of all accounts.
    const lazy = accountScanConfigs({ ...config, accountRangeEnd: 2147483647 }, 'dash')[Symbol.iterator]();
    expect(lazy.next().value.account).toBe(0);
  });
  for (const network of ['mainnet', 'testnet'] as const) {
    it(`advances past empty Bitcoin accounts and resets every family margin (${network})`, async () => {
      const queried: string[][] = [];
      for (const plan of accountScanConfigs({ ...config, network, accountRangeEnd: 1, coreReceiveCount: 100 }, 'bitcoin')) {
        const addresses: string[] = [];
        const report = await BITCOIN_RECOVERY_ADAPTER.scan({ id: 'fixture', label: 'Fixture', mnemonic: MNEMONIC, passphrase: '' }, plan, {
          signal: new AbortController().signal, onProgress: () => {}, onFinding: () => {},
          networkApi: api({ utxoAddresses: async (_network, batch) => { addresses.push(...batch); return batch.map(address => ({ address, balance: '0', transactionCount: 0 })); } }),
        });
        expect(report.sections[0]!.scanned).toBe(4 * 120);
        queried.push(addresses);
      }
      expect(new Set(queried.flat()).size).toBe(960);
    });
    it(`extends activity at address 119 to 139, then resets for the next Dash account (${network})`, async () => {
      const seed = mnemonicToSeed(MNEMONIC);
      const root = HDKey.fromMasterSeed(seed);
      const coin = network === 'mainnet' ? 5 : 1;
      const version = network === 'mainnet' ? 76 : 140;
      const oracle = (account: number, branch: number, index: number) => {
        const child = root.derive(`m/44'/${coin}'/${account}'/${branch}/${index}`);
        try { return encodeP2pkh(hash160(child.publicKey!), version); } finally { child.wipePrivateData(); }
      };
      try {
        const used = oracle(0, 0, 119);
        for (const plan of accountScanConfigs({ ...config, network, accountRangeEnd: 1, coreReceiveCount: 100, coreChangeCount: 100 }, 'dash')) {
          const addresses: string[] = [];
          const gateway = new RecoveryNetworkGateway(new SecretEgressGuard(), api({
            coreStatus: async () => ({ status: 'ok' }), coreTip: async () => ({ resultSet: [{ height: 10 }] }),
            coreAddressInfo: async (_network, batch) => { addresses.push(...batch); return batch.map(address => ({ address, balance: '0', txCount: address === used ? 1 : 0 })); },
          }));
          const report = await scanDashCore('fixture', seed, plan, gateway, new AbortController().signal, () => {}, () => {});
          expect(report.state).toBe('complete');
          const receiveCount = plan.account === 0 ? 140 : 120;
          expect(addresses).toEqual([
            ...Array.from({ length: receiveCount }, (_, i) => oracle(plan.account, 0, i)),
            ...Array.from({ length: 120 }, (_, i) => oracle(plan.account, 1, i)),
          ]);
        }
      } finally { root.wipePrivateData(); seed.fill(0); }
    });
    it(`does not re-scan Ledger Live accounts or fixed legacy paths (${network})`, async () => {
      const seen: string[][] = [];
      for (const plan of accountScanConfigs({ ...config, network, account: 1, accountRangeEnd: 2 }, 'ethereum')) {
        const addresses: string[] = [];
        await ETHEREUM_RECOVERY_ADAPTER.scan({ id: 'fixture', label: 'Fixture', mnemonic: MNEMONIC, passphrase: '' }, plan, {
          signal: new AbortController().signal, onProgress: () => {}, onFinding: () => {},
          networkApi: api({ evmAccounts: async (_network, batch) => { addresses.push(...batch); return { blockNumber: '10', entries: batch.map(address => ({ address, balance: '0', nonce: '0' })) }; } }),
        });
        seen.push(addresses);
      }
      // Standard account: 21 addresses. Ledger Live /0/0 is already among them.
      // Fixed legacy chain: another 21 addresses in the first report only.
      expect(seen.map(v => v.length)).toEqual([42,21]);
      expect(new Set(seen.flat()).size).toBe(63);
    });
  }
});

for (const network of ['mainnet', 'testnet'] as const) {
  it(`scans both hardened Platform classes of account 1 with a fresh margin (${network})`, async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const root = HDKey.fromMasterSeed(seed);
    try {
      const expected: string[] = [];
      for (const keyClass of [0, 1]) for (let index = 0; index < 21; index++) {
        const child = root.derive(`m/9'/${network === 'mainnet' ? 5 : 1}'/17'/1'/${keyClass}'/${index}`);
        try { expected.push(encodePlatformP2pkh(hash160(child.publicKey!), network === 'mainnet' ? 'dash' : 'tdash')); }
        finally { child.wipePrivateData(); }
      }
      const requested: string[] = [];
      const client = { addresses: async (addresses: string[]) => {
        requested.push(...addresses);
        return { entries: [], metadata: { height: '100', protocolVersion: 1 } };
      } } as unknown as DashPlatformClient;
      const plan = [...accountScanConfigs({ ...config, network, account: 1, accountRangeEnd: 1, scanCore: false, scanPlatformAddresses: true, platformAddressCount: 1 }, 'dash')][0]!;
      const section = await scanDashPlatformAddresses('fixture', seed, plan, client, new AbortController().signal, () => {}, () => {});
      expect(section.state).toBe('complete');
      expect(requested).toEqual(expected);
    } finally { root.wipePrivateData(); seed.fill(0); }
  });
}
