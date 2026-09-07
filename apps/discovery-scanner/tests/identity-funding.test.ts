import { requirePublic, rootFromSeed } from '@ckd/core/bip32.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { bytesToHex, hash160, wipe } from '@ckd/core/crypto.js';
import { getDashNetwork } from '@ckd/core/networks.js';
import { describe, expect, it } from 'vitest';
import { scanDashIdentities } from '../src/coins/dash/identity-scanner.js';
import { DashPlatformClient } from '../src/coins/dash/platform-client.js';
import { RecoveryNetworkGateway } from '../src/network-gateway.js';
import type { RecoveryNetworkApi } from '../src/network-protocol.js';
import { SecretEgressGuard } from '../src/secret-guard.js';
import type { RecoveryScanConfig } from '../src/types.js';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const IDENTITY = '5ZKi1hPMQHPqRJjqp8EQgrXBMYrKjDTXFYBBHQZX88rw';
const FUNDING_TRANSACTION = 'ad4cc9b6e395204a46f3e8df20f220f70f433c578469e5617b588d0df53d7998';

function unavailable(): Promise<never> {
  return Promise.reject(new Error('Unexpected network operation.'));
}

function baseApi(): RecoveryNetworkApi {
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
  };
}

const config: RecoveryScanConfig = {
  network: 'mainnet',
  account: 0,
  scanCore: false,
  coreReceiveCount: 0,
  coreChangeCount: 0,
  scanLegacyCore: false,
  legacyCoreCount: 0,
  scanCoinJoin: false,
  coinJoinExternalCount: 0,
  coinJoinInternalCount: 0,
  scanIdentityFunding: true,
  identityFundingCount: 1,
  identityTopUpIdentityCount: 0,
  identityTopUpCount: 0,
  scanProviderCollateral: false,
  providerCollateralCount: 0,
  scanPlatformAddresses: false,
  platformAddressCount: 0,
  scanPlatformIdentities: true,
  identityStartIndex: 0,
  identityGapLimit: 1,
  identityScanLimit: 2,
  includeUsedZeroBalance: false,
  scanShieldedPool: false,
};

describe('Dash identity registration funding', () => {
  it('links the asset-lock transaction and matches its DIP13 registration key', async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const network = getDashNetwork('mainnet');
    const root = rootFromSeed(seed, network.versions);
    const path = "m/9'/5'/5'/1'/0";
    const node = root.derive(path);
    const publicKey = requirePublic(node, path);
    const registrationKeyHash = bytesToHex(hash160(publicKey));
    wipe(publicKey);
    node.wipePrivateData();
    root.wipePrivateData();

    let identityLookup = 0;
    const networkApi: RecoveryNetworkApi = {
      ...baseApi(),
      platformIdentityByPublicKeyHash: async () => {
        identityLookup += 1;
        return {
          identities: identityLookup === 1 ? [{ identifier: IDENTITY, balance: '150000000000', revision: '1' }] : [],
          metadata: { height: '100', coreChainLockedHeight: 99, protocolVersion: 1, timeMs: '1' },
          proofQueries: 1,
          dapiDurationsMs: [2],
        };
      },
      platformIdentityHistory: async () => ({
        resource: IDENTITY,
        balance: '150000000000',
        transactionCount: 1,
        incomingCount: 1,
        outgoingCount: 0,
        totalReceived: '150000000000',
        totalSent: '0',
        totalFees: '0',
        firstSeen: '2026-09-05T00:00:00.000Z',
        lastSeen: '2026-09-05T00:00:00.000Z',
        indexedHeight: 100,
        fundingCoreTx: FUNDING_TRANSACTION,
      }),
      coreTransaction: async () => ({
        hash: FUNDING_TRANSACTION,
        type: 'ASSET_LOCK',
        timestamp: '2026-09-05T00:00:00.000Z',
        inputAddresses: ['XccfCSFwiQKsP3QFp2oLwuzH8sbpj5NAni'],
        assetLockCreditOutputs: [{ amount: '150000000', publicKeyHash: registrationKeyHash }],
      }),
    };
    const gateway = new RecoveryNetworkGateway(new SecretEgressGuard(), networkApi);
    const section = await scanDashIdentities(
      'seed-1',
      seed,
      config,
      new DashPlatformClient('mainnet', gateway),
      new AbortController().signal,
      () => {},
      () => {},
    );
    wipe(seed);

    expect(section.findings).toHaveLength(1);
    expect(Object.fromEntries(section.findings[0]!.fields.map(({ label, value }) => [label, value]))).toMatchObject({
      'L1 funding transaction': FUNDING_TRANSACTION,
      'L1 funding inputs': 'XccfCSFwiQKsP3QFp2oLwuzH8sbpj5NAni',
      'Asset-lock credit key hash': registrationKeyHash,
      'Registration funding key path': path,
    });
    expect(section.metrics).toContainEqual({ label: 'L1 funding details', value: '1/1 linked' });
  });

  it('limits proof lookups to two concurrent unique-key requests', async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    let active = 0;
    let maximumActive = 0;
    let lookupCount = 0;
    const networkApi: RecoveryNetworkApi = {
      ...baseApi(),
      platformIdentityByPublicKeyHash: async () => {
        lookupCount += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return {
          identities: [],
          metadata: { height: '100', coreChainLockedHeight: 99, protocolVersion: 1, timeMs: '1' },
          proofQueries: 1,
          dapiDurationsMs: [2],
        };
      },
    };
    const gateway = new RecoveryNetworkGateway(new SecretEgressGuard(), networkApi);
    try {
      const section = await scanDashIdentities(
        'seed-1',
        seed,
        { ...config, scanIdentityFunding: false, identityGapLimit: 5, identityScanLimit: 5 },
        new DashPlatformClient('mainnet', gateway),
        new AbortController().signal,
        () => {},
        () => {},
      );

      expect(lookupCount).toBe(5);
      expect(maximumActive).toBe(2);
      expect(section.scanned).toBe(5);
      expect(section.metrics).toContainEqual({ label: 'Proof queries', value: '5' });
    } finally {
      wipe(seed);
    }
  });

  it('rejects non-unique fallback proof responses for standard ECDSA identity keys', async () => {
    const seed = mnemonicToSeed(MNEMONIC);
    const networkApi: RecoveryNetworkApi = {
      ...baseApi(),
      platformIdentityByPublicKeyHash: async () => ({
        identities: [],
        metadata: { height: '100', coreChainLockedHeight: 99, protocolVersion: 1, timeMs: '1' },
        proofQueries: 2,
        dapiDurationsMs: [2, 3],
      }),
    };
    const gateway = new RecoveryNetworkGateway(new SecretEgressGuard(), networkApi);
    try {
      await expect(scanDashIdentities(
        'seed-1',
        seed,
        { ...config, scanIdentityFunding: false, identityGapLimit: 1, identityScanLimit: 1 },
        new DashPlatformClient('mainnet', gateway),
        new AbortController().signal,
        () => {},
        () => {},
      )).rejects.toThrow('Identity proof-query count must be one.');
    } finally {
      wipe(seed);
    }
  });
});
