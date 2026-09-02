import { MAX_BIP32_INDEX, assertIndex } from '@ckd/core/bip32.js';
import { assertValidMnemonic, mnemonicToSeed } from '@ckd/core/bip39.js';
import { SecretEgressGuard, disposeSecretBytes } from '../../secret-guard.js';
import { RecoveryNetworkGateway } from '../../network-gateway.js';
import type {
  RecoveryCoinAdapter,
  RecoveryProgress,
  RecoveryScanConfig,
  RecoverySection,
  RecoverySectionId,
  RecoverySeedInput,
  RecoveryWalletResult,
} from '../../types.js';
import { scanDashCore } from './core-scanner.js';
import { scanDashIdentities } from './identity-scanner.js';
import { DashPlatformClient } from './platform-client.js';
import { scanDashPlatformAddresses } from './platform-scanner.js';
import { scanDashShielded, scanDashShieldedBatch } from './shielded-scanner.js';
import { failedSection } from './util.js';
import { summarizeDashSections } from './summary.js';
import { RecoveryConcurrencyLimiter } from '../../concurrency.js';

const TITLES: Record<RecoverySectionId, [string, string]> = {
  core: ['Dash Core · L1', 'BIP44 receive and change address scan'],
  platform: ['Dash Platform addresses', 'DIP17 payment address scan'],
  identity: ['Dash Platform identities', 'DIP13 identity discovery'],
  shielded: ['Dash Orchard · shielded pool', 'Account-wide encrypted note recovery'],
};

function assertCount(value: number, label: string, allowZero = false): void {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum || value > MAX_BIP32_INDEX + 1) {
    throw new Error(`${label} must be an integer from ${minimum} to ${MAX_BIP32_INDEX + 1}.`);
  }
}

function validateConfig(config: RecoveryScanConfig): void {
  assertIndex(config.account, 'Account');
  assertCount(config.coreReceiveCount, 'Core receive count', true);
  assertCount(config.coreChangeCount, 'Core change count', true);
  if (config.coreReceiveCount + config.coreChangeCount < 1) {
    throw new Error('At least one Dash Core receive or change address must be scanned.');
  }
  assertCount(config.platformAddressCount, 'Platform address count', true);
  assertIndex(config.identityStartIndex, 'Identity start index');
  assertCount(config.identityGapLimit, 'Identity gap limit');
  assertCount(config.identityScanLimit, 'Identity scan limit');
  if (config.identityStartIndex + config.identityScanLimit - 1 > MAX_BIP32_INDEX) {
    throw new Error('The requested identity scan range exceeds the BIP32 index space.');
  }
  if (typeof config.includeUsedZeroBalance !== 'boolean' || typeof config.scanShieldedPool !== 'boolean') {
    throw new Error('Recovery output and Orchard options must be boolean values.');
  }
}

function isAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

async function guardedSection(
  id: RecoverySectionId,
  run: () => Promise<RecoverySection>,
): Promise<RecoverySection> {
  try {
    return await run();
  } catch (cause) {
    if (isAbort(cause)) throw cause;
    const [title, description] = TITLES[id];
    return failedSection(id, title, description, cause);
  }
}

export const DASH_RECOVERY_ADAPTER: RecoveryCoinAdapter = {
  id: 'dash',
  label: 'Dash',
  networks: ['mainnet', 'testnet'],

  async prepareBatch(inputs, config, context): Promise<ReadonlyMap<string, RecoverySection>> {
    validateConfig(config);
    return scanDashShieldedBatch(inputs, config, context);
  },

  async scan(input, config, context): Promise<RecoveryWalletResult> {
    validateConfig(config);
    const mnemonic = assertValidMnemonic(input.mnemonic);
    const seed = mnemonicToSeed(mnemonic, input.passphrase);
    const guard = new SecretEgressGuard();
    guard.registerString('BIP39 mnemonic', mnemonic);
    guard.registerString('BIP39 passphrase', input.passphrase);
    guard.registerBytes('BIP39 seed', seed);
    context.sessionSecretGuard?.registerString('BIP39 mnemonic', mnemonic);
    context.sessionSecretGuard?.registerString('BIP39 passphrase', input.passphrase);
    context.sessionSecretGuard?.registerBytes('BIP39 seed', seed);
    const gateway = new RecoveryNetworkGateway(guard, context.networkApi, context.networkLimiter ?? new RecoveryConcurrencyLimiter(5));
    const platformClient = new DashPlatformClient(config.network, gateway);
    const startedAt = new Date().toISOString();
    const onProgress = (progress: RecoveryProgress): void => context.onProgress(progress);
    const onFinding = (section: RecoverySectionId) => (finding: Parameters<typeof context.onFinding>[2]): void => {
      context.onFinding(input.id, section, finding);
    };
    try {
      context.onProgress({ inputId: input.id, section: 'prepare', message: 'Mnemonic validated and seed derived locally', completed: 1, total: 1 });
      const startSection = async (
        id: RecoverySectionId,
        task: () => Promise<RecoverySection>,
      ): Promise<RecoverySection> => {
        context.onProgress({ inputId: input.id, section: id, message: `Starting ${TITLES[id][0]} scan`, completed: 0, total: null });
        const section = await guardedSection(id, task);
        const message = section.state === 'failed'
          ? `Failed · ${section.warning ?? 'authoritative result unavailable'}`
          : section.state === 'partial'
            ? `Partial · ${section.warning ?? 'configured range ended before discovery completed'}`
            : section.state === 'skipped'
              ? 'Skipped by scan settings'
              // `scanned` is a number for address scans and a bigint for the
              // Orchard pool; `=== 1` alone is always false for the bigint.
              : `Complete · ${section.scanned.toLocaleString()} item${section.scanned === 1 || section.scanned === 1n ? '' : 's'} checked`;
        context.onProgress({ inputId: input.id, section: id, message, completed: 1, total: 1 });
        return section;
      };
      // These scanners have independent accounting state. Promise.all keeps the
      // returned section order stable while the shared semaphore remains the
      // sole authority for the maximum number of network/DAPI operations.
      const sections = await Promise.all([
        startSection('core', () => scanDashCore(input.id, seed, config, gateway, context.signal, onProgress, onFinding('core'))),
        startSection('platform', () => scanDashPlatformAddresses(input.id, seed, config, platformClient, context.signal, onProgress, onFinding('platform'))),
        startSection('identity', () => scanDashIdentities(input.id, seed, config, platformClient, context.signal, onProgress, onFinding('identity'))),
        startSection('shielded', async () => {
          if (context.preparedSections !== undefined) {
            const prepared = (await context.preparedSections).get(input.id);
            if (prepared === undefined) throw new Error(`Shared Orchard scan omitted ${input.id}.`);
            return prepared;
          }
          return scanDashShielded(
            input.id,
            seed,
            config,
            gateway,
            context.signal,
            onProgress,
            onFinding('shielded'),
            context.sessionSecretGuard,
          );
        }),
      ]);
      return {
        inputId: input.id,
        label: input.label,
        coinId: 'dash',
        coinLabel: 'Dash',
        network: config.network,
        startedAt,
        completedAt: new Date().toISOString(),
        overview: summarizeDashSections(sections),
        sections,
        warnings: [
          'This utility has not received an independent cryptography-specialist audit. Pinned cryptographic dependencies do not replace an audit of their integration.',
          'For found funds, the safest recovery is to copy the public address, derivation path, branch/index and balance into the recovery report, then restore the mnemonic in a standard Dash wallet on a trusted device.',
        ],
      };
    } finally {
      disposeSecretBytes(seed);
      guard.clear();
    }
  },
};

export type { RecoverySeedInput, RecoveryScanConfig };
