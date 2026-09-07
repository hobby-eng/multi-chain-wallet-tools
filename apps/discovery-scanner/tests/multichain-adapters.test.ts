import { describe, expect, it } from 'vitest';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { BITCOIN_RECOVERY_ADAPTER } from '../src/coins/bitcoin/index.js';
import { scanDashCore } from '../src/coins/dash/core-scanner.js';
import { ETHEREUM_RECOVERY_ADAPTER } from '../src/coins/ethereum/index.js';
import { RecoveryNetworkGateway } from '../src/network-gateway.js';
import type { RecoveryNetworkApi } from '../src/network-protocol.js';
import { SecretEgressGuard } from '../src/secret-guard.js';
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
    utxoAddresses: unavailable,
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

describe('Multi-Chain recovery adapters', () => {
  it('scans all common Bitcoin address families from public addresses only', async () => {
    const requested: string[] = [];
    const result = await BITCOIN_RECOVERY_ADAPTER.scan(
      { id: 'seed-1', label: 'Seed phrase #1', mnemonic: MNEMONIC, passphrase: '' },
      config,
      {
        signal: new AbortController().signal,
        networkApi: api({
          utxoAddresses: async (_network, addresses) => {
            requested.push(...addresses);
            return addresses.map((address) => ({ address, balance: '0', transactionCount: 0 }));
          },
        }),
        onProgress: () => {},
        onFinding: () => {},
      },
    );
    expect(requested).toEqual([
      '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA',
      '37VucYSaXLCAsxYyAPfbSi9eh4iEcbShgf',
      'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
    ]);
    expect(result.coinId).toBe('bitcoin');
    expect(result.sections[0]?.scanned).toBe(4);
  });

  it('adds a selected Bitcoin custom path and address format', async () => {
    const requested: string[] = [];
    const result = await BITCOIN_RECOVERY_ADAPTER.scan(
      { id: 'seed-1', label: 'Seed phrase #1', mnemonic: MNEMONIC, passphrase: '' },
      {
        ...config,
        scanCustomPath: true,
        customPathTemplate: "m/44'/0'/7'/0/{index}",
        customPathFormat: 'legacy',
        customPathCount: 1,
      },
      {
        signal: new AbortController().signal,
        networkApi: api({
          utxoAddresses: async (_network, addresses) => {
            requested.push(...addresses);
            return addresses.map((address) => ({ address, balance: '0', transactionCount: 0 }));
          },
        }),
        onProgress: () => {},
        onFinding: () => {},
      },
    );
    expect(new Set(requested).size).toBe(5);
    expect(result.sections[0]?.scanned).toBe(5);
    expect(result.overview).toContainEqual({ label: 'Path profiles', value: '5' });
  });

  it('scans a custom Dash P2PKH path without requiring the standard Core family', async () => {
    const requested: string[] = [];
    const seed = mnemonicToSeed(MNEMONIC, '');
    const guard = new SecretEgressGuard();
    guard.registerBytes('seed', seed);
    const section = await scanDashCore(
      'seed-1',
      seed,
      {
        ...config,
        scanCore: false,
        coreReceiveCount: 0,
        scanCustomPath: true,
        customPathTemplate: "m/44'/5'/7'/0/{index}",
        customPathFormat: 'p2pkh',
        customPathCount: 1,
      },
      new RecoveryNetworkGateway(guard, api({
        coreStatus: async () => ({ status: 'ok' }),
        coreTip: async () => ({ resultSet: [{ height: 2_300_000, timestamp: '2026-09-02T00:00:00.000Z' }] }),
        coreAddressInfo: async (_network, addresses) => {
          requested.push(...addresses);
          return addresses.map((address) => ({ address, balance: '0', txCount: 0 }));
        },
      })),
      new AbortController().signal,
      () => {},
      () => {},
    );
    seed.fill(0);
    guard.clear();
    expect(requested).toHaveLength(1);
    expect(section.scanned).toBe(1);
  });

  it('scans standard, Ledger Live, and legacy Ledger Ethereum paths without duplicate requests', async () => {
    const requested: string[] = [];
    const progress: string[] = [];
    const result = await ETHEREUM_RECOVERY_ADAPTER.scan(
      { id: 'seed-1', label: 'Seed phrase #1', mnemonic: MNEMONIC, passphrase: '' },
      config,
      {
        signal: new AbortController().signal,
        networkApi: api({
          evmAccounts: async (_network, addresses) => {
            requested.push(...addresses);
            return {
              blockNumber: '1',
              entries: addresses.map((address) => ({ address, balance: '0', nonce: '0' })),
            };
          },
        }),
        onProgress: (event) => progress.push(event.message),
        onFinding: () => {},
      },
    );
    expect(requested).toEqual([
      '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      '0xB8Fd42000d00202DCbCF5e18d6640d656345FD6A',
    ]);
    expect(progress).toEqual([
      'Standard BIP44 · MetaMask / Trezor: checked 1 of 1 derivation candidates',
      'Ledger Live accounts: checked 1 of 1 derivation candidates',
      'Legacy Ledger / MEW: checked 1 of 1 derivation candidates',
    ]);
    expect(result.coinId).toBe('ethereum');
    expect(result.sections[0]?.scanned).toBe(3);
    expect(result.overview).toContainEqual({ label: 'Path profiles', value: '3' });
    expect(result.overview).toContainEqual({ label: 'Unique addresses queried', value: '2' });
  });

  it.each([
    "m/44'/60'/7'/0/{index}",
    "m/44'/60'/7'/0/{index}'",
  ])('supports validated custom Ethereum path template %s', async (evmPathTemplate) => {
    const requested: string[] = [];
    const result = await ETHEREUM_RECOVERY_ADAPTER.scan(
      { id: 'seed-1', label: 'Seed phrase #1', mnemonic: MNEMONIC, passphrase: '' },
      {
        ...config,
        scanCustomPath: true,
        customPathTemplate: evmPathTemplate,
        customPathFormat: 'eoa',
        customPathCount: 1,
      },
      {
        signal: new AbortController().signal,
        networkApi: api({
          evmAccounts: async (_network, addresses) => {
            requested.push(...addresses);
            return {
              blockNumber: '1',
              entries: addresses.map((address) => ({ address, balance: '0', nonce: '0' })),
            };
          },
        }),
        onProgress: () => {},
        onFinding: () => {},
      },
    );
    expect(new Set(requested).size).toBe(3);
    expect(result.sections[0]?.scanned).toBe(4);
    expect(result.overview).toContainEqual({ label: 'Path profiles', value: '4' });
  });

  it.each([
    '',
    "44'/60'/0'/0/{index}",
    "m/44'/60'/0'/0/0",
    "m/44'/60'/{index}/{index}",
    "m/044'/60'/0'/0/{index}",
    "m/44'/60'/2147483648'/0/{index}",
  ])('rejects invalid custom Ethereum template %j', async (evmPathTemplate) => {
    await expect(ETHEREUM_RECOVERY_ADAPTER.scan(
      { id: 'seed-1', label: 'Seed phrase #1', mnemonic: MNEMONIC, passphrase: '' },
      {
        ...config,
        scanCustomPath: true,
        customPathTemplate: evmPathTemplate,
        customPathFormat: 'eoa',
        customPathCount: 1,
      },
      {
        signal: new AbortController().signal,
        networkApi: api({}),
        onProgress: () => {},
        onFinding: () => {},
      },
    )).rejects.toThrow(/Custom path/u);
  });
});
