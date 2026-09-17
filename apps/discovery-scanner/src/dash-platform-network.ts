import { fetchRecoveryJson, recoveryAbortError, throwIfRecoveryAborted } from './recovery-http.js';
import {
  platformDecimal,
  platformPageItems,
  platformPageTimestamp,
  platformRecord,
  platformTimestamp,
  platformUnsignedInteger,
} from './platform-explorer-values.js';
import { assertPlatformExplorerNetwork } from '@ckd/dash-network/provider-json.js';
import { IdentityPageIntegrity } from '@ckd/dash-network/identity-pagination.js';
import { EvoSDK, type Identity, type ShieldedEncryptedNote } from '@dashevo/evo-sdk';
import { copyAndFreeEvoShieldedNote } from '@ckd/dash-network/evo-shielded-note.js';
import { validatePlatformP2pkhAddress } from '@ckd/dash-network/public-address.js';
import type {
  IdentityLookupView,
  PlatformAddressBatchView,
  PlatformHistorySummaryView,
  ProofMetadataView,
  RecoveryNetwork,
  ShieldedPageView,
} from '@ckd/network-boundary/protocol.js';
import { RECOVERY_PLATFORM_ADDRESS_BATCH } from '@ckd/network-boundary/protocol.js';
import { describeUnknownError, freeThrownValue } from '@ckd/core/error-handling.js';
import {
  assertAddressBatch,
  assertNetwork,
  assertSingleAddress,
  PLATFORM_IDENTIFIER_PATTERN,
  POOL_POSITION_PATTERN,
  publicKeyHashBytes,
  TRANSACTION_HASH_PATTERN,
} from './network-validation.js';

const PLATFORM_HISTORY_PAGE_SIZE = 100;
export const PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS = 1_000;
export const PLATFORM_IDENTITY_HISTORY_TIMEOUT_MS = 30_000;
const PLATFORM_EXPLORER_ENDPOINTS: Record<RecoveryNetwork, string> = {
  mainnet: 'https://platform-explorer.pshenmic.dev',
  testnet: 'https://testnet.platform-explorer.pshenmic.dev',
};
const EVO_CONNECT_TIMEOUT_MS = 8_000;
const EVO_REQUEST_TIMEOUT_MS = 10_000;
const EVO_EXPLICIT_ATTEMPTS = 3;
const EVO_RETRY_DELAY_MS = 400;

interface Freeable {
  free(): void;
}
function freeIfPossible(value: unknown): void {
  if (typeof value === 'object' && value !== null && 'free' in value && typeof value.free === 'function') {
    (value as Freeable).free();
  }
}
function metadataView(metadata: {
  height: bigint;
  coreChainLockedHeight: number;
  protocolVersion: number;
  timeMs: bigint;
}): ProofMetadataView {
  return {
    height: metadata.height.toString(),
    coreChainLockedHeight: metadata.coreChainLockedHeight,
    protocolVersion: metadata.protocolVersion,
    timeMs: metadata.timeMs.toString(),
  };
}
function identityView(identity: Identity): IdentityLookupView['identities'][number] {
  const identifier = identity.id;
  try {
    return {
      identifier: identifier.toBase58(),
      balance: identity.balance.toString(),
      revision: identity.revision.toString(),
    };
  } finally {
    identifier.free();
  }
}
async function waitBeforeProofRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  throwIfRecoveryAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, EVO_RETRY_DELAY_MS * attempt);
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(recoveryAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) onAbort();
  });
}
function isNonRetriableProofFailure(message: string): boolean {
  return /invalid argument|malformed|out of range|unsupported|rejected an invalid/iu.test(message);
}

export class DashPlatformNetworkService {
  readonly #sdkByNetworkAndPurpose = new Map<string, Promise<EvoSDK>>();

  async #platformExplorerHeight(network: RecoveryNetwork, signal?: AbortSignal): Promise<number> {
    const endpoint = PLATFORM_EXPLORER_ENDPOINTS[network];
    const status = platformRecord(await fetchRecoveryJson(`${endpoint}/status`, signal), 'status');
    const indexer = platformRecord(status.indexer, 'indexer status');
    if (indexer.status !== 'synced') throw new Error('Platform Explorer index is not synchronized.');
    assertPlatformExplorerNetwork(status.network, network);
    const api = platformRecord(status.api, 'API status');
    return platformUnsignedInteger(platformRecord(api.block, 'latest block').height, 'latest indexed height');
  }

  #sdk(network: RecoveryNetwork, purpose: 'addresses' | 'identity' | 'shielded'): Promise<EvoSDK> {
    assertNetwork(network);
    const key = `${network}:${purpose}`;
    const existing = this.#sdkByNetworkAndPurpose.get(key);
    if (existing !== undefined) return existing;
    const connecting = (async (): Promise<EvoSDK> => {
      // Keep transport retries at zero and perform explicit, observable
      // retries below. The SDK's nested retry/connection rotation could keep one
      // tail request alive for more than two minutes and hold an entire
      // identity batch. A failed proof is never converted to an empty result.
      const settings = {
        connectTimeoutMs: EVO_CONNECT_TIMEOUT_MS,
        timeoutMs: EVO_REQUEST_TIMEOUT_MS,
        retries: 0,
        banFailedAddress: true,
      };
      const sdk = network === 'mainnet' ? EvoSDK.mainnetTrusted({ settings }) : EvoSDK.testnetTrusted({ settings });
      await sdk.connect();
      return sdk;
    })();
    this.#sdkByNetworkAndPurpose.set(key, connecting);
    void connecting.catch(() => {
      if (this.#sdkByNetworkAndPurpose.get(key) === connecting) this.#sdkByNetworkAndPurpose.delete(key);
    });
    return connecting;
  }

  async #proofWithExplicitRetry<T>(
    network: RecoveryNetwork,
    purpose: 'addresses' | 'identity' | 'shielded',
    run: (sdk: EvoSDK) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const failures: string[] = [];
    const key = `${network}:${purpose}`;
    for (let attempt = 1; attempt <= EVO_EXPLICIT_ATTEMPTS; attempt += 1) {
      throwIfRecoveryAborted(signal);
      let sdk: EvoSDK | undefined;
      let sdkPromise: Promise<EvoSDK> | undefined;
      try {
        sdkPromise = this.#sdk(network, purpose);
        sdk = await sdkPromise;
        throwIfRecoveryAborted(signal);
        return await run(sdk);
      } catch (cause) {
        if (signal?.aborted === true) throw recoveryAbortError();
        const failure = describeUnknownError(cause);
        failures.push(`attempt ${attempt}: ${failure}`);
        freeThrownValue(cause);
        if (sdkPromise !== undefined && this.#sdkByNetworkAndPurpose.get(key) === sdkPromise) {
          this.#sdkByNetworkAndPurpose.delete(key);
        }
        if (isNonRetriableProofFailure(failure)) {
          throw new Error(`Proof query was rejected without retry (${failure}).`);
        }
        if (attempt === EVO_EXPLICIT_ATTEMPTS) {
          throw new Error(
            `Proof query failed after ${EVO_EXPLICIT_ATTEMPTS} bounded attempts (${failures.join('; ')}).`,
          );
        }
        await waitBeforeProofRetry(attempt, signal);
      }
    }
    throw new Error('Proof query exhausted its bounded retry state.');
  }
  async platformAddresses(
    network: RecoveryNetwork,
    addresses: string[],
    signal?: AbortSignal,
  ): Promise<PlatformAddressBatchView> {
    throwIfRecoveryAborted(signal);
    assertNetwork(network);
    assertAddressBatch(
      addresses,
      network,
      validatePlatformP2pkhAddress,
      'Dash Platform P2PKH',
      RECOVERY_PLATFORM_ADDRESS_BATCH,
    );
    const response = await this.#proofWithExplicitRetry(
      network,
      'addresses',
      (sdk) => sdk.addresses.getManyWithProof(addresses),
      signal,
    );
    const metadata = response.metadata;
    try {
      const entries: PlatformAddressBatchView['entries'] = [];
      for (const [key, info] of response.data.entries()) {
        try {
          entries.push([key, info == null ? null : { balance: info.balance.toString(), nonce: info.nonce.toString() }]);
        } finally {
          freeIfPossible(info);
        }
      }
      return { entries, metadata: metadataView(metadata) };
    } finally {
      metadata.free();
      response.free();
    }
  }

  async platformAddressHistory(
    network: RecoveryNetwork,
    address: string,
    signal?: AbortSignal,
  ): Promise<PlatformHistorySummaryView> {
    assertNetwork(network);
    assertSingleAddress(address, network, validatePlatformP2pkhAddress, 'Dash Platform P2PKH');
    const endpoint = PLATFORM_EXPLORER_ENDPOINTS[network];
    const indexedHeight = await this.#platformExplorerHeight(network, signal);
    const info = platformRecord(
      await fetchRecoveryJson(`${endpoint}/platformAddress/${encodeURIComponent(address)}/info`, signal),
      'address info',
    );
    if (info.bech32mAddress !== address)
      throw new Error('Platform Explorer address info did not match the requested address.');
    const transactionCount = platformUnsignedInteger(info.totalTxs, 'address transaction count');
    const [firstSeen, lastSeen] =
      transactionCount === 0
        ? [null, null]
        : await Promise.all([
            fetchRecoveryJson(
              `${endpoint}/platformAddress/${encodeURIComponent(address)}/transactions?page=1&limit=1&order=asc`,
              signal,
            ).then((value) => platformPageTimestamp(value, 'first address transition')),
            fetchRecoveryJson(
              `${endpoint}/platformAddress/${encodeURIComponent(address)}/transactions?page=1&limit=1&order=desc`,
              signal,
            ).then((value) => platformPageTimestamp(value, 'last address transition')),
          ]);
    return {
      resource: address,
      balance: platformDecimal(info.balance, 'address balance'),
      transactionCount,
      incomingCount: platformUnsignedInteger(info.incomingTxs, 'incoming address transition count'),
      outgoingCount: platformUnsignedInteger(info.outgoingTxs, 'outgoing address transition count'),
      totalReceived: platformDecimal(info.totalIncomingAmount, 'total incoming amount', true),
      totalSent: platformDecimal(info.totalOutgoingAmount, 'total outgoing amount', true),
      totalFees: null,
      firstSeen,
      lastSeen,
      indexedHeight,
    };
  }

  async platformIdentityByPublicKeyHash(
    network: RecoveryNetwork,
    publicKeyHashHex: string,
    signal?: AbortSignal,
  ): Promise<IdentityLookupView> {
    throwIfRecoveryAborted(signal);
    assertNetwork(network);
    const publicKeyHash = publicKeyHashBytes(publicKeyHashHex);
    const durations: number[] = [];
    const uniqueStarted = performance.now();
    const uniqueResponse = await this.#proofWithExplicitRetry(
      network,
      'identity',
      (sdk) => sdk.identities.byPublicKeyHashWithProof(publicKeyHash),
      signal,
    );
    durations.push(performance.now() - uniqueStarted);
    const uniqueMetadata = uniqueResponse.metadata;
    try {
      const uniqueIdentity = uniqueResponse.data;
      try {
        return {
          identities: uniqueIdentity === undefined || uniqueIdentity === null ? [] : [identityView(uniqueIdentity)],
          metadata: metadataView(uniqueMetadata),
          proofQueries: 1,
          dapiDurationsMs: durations,
        };
      } finally {
        freeIfPossible(uniqueIdentity);
      }
    } finally {
      uniqueMetadata.free();
      uniqueResponse.free();
    }
  }

  async platformIdentityHistory(
    network: RecoveryNetwork,
    identifier: string,
    signal?: AbortSignal,
  ): Promise<PlatformHistorySummaryView> {
    const deadline = Date.now() + PLATFORM_IDENTITY_HISTORY_TIMEOUT_MS;
    const request = (url: string): Promise<unknown> => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Platform identity history exceeded its time budget.');
      return fetchRecoveryJson(url, signal, {}, remaining);
    };
    assertNetwork(network);
    if (!PLATFORM_IDENTIFIER_PATTERN.test(identifier))
      throw new Error('Network Worker rejected an invalid Platform identity.');
    const endpoint = PLATFORM_EXPLORER_ENDPOINTS[network];
    const indexedHeight = await this.#platformExplorerHeight(network, signal);
    const info = platformRecord(
      await request(`${endpoint}/identity/${encodeURIComponent(identifier)}`),
      'identity info',
    );
    if (info.identifier !== identifier)
      throw new Error('Platform Explorer identity info did not match the requested identity.');
    const expectedTransfers = platformUnsignedInteger(info.totalTransfers, 'identity transfer count');
    if (expectedTransfers > PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS) {
      throw new Error(
        `Platform identity history exceeds the ${PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS}-transfer safety limit; proof-verified balance remains available.`,
      );
    }
    const transactionCount = platformUnsignedInteger(info.totalTxs, 'identity transaction count');
    const firstSeen = platformTimestamp(info.timestamp, 'identity first-seen timestamp');
    const lastSeen =
      transactionCount === 0
        ? firstSeen
        : await request(
            `${endpoint}/identity/${encodeURIComponent(identifier)}/transactions?page=1&limit=1&order=desc`,
          ).then((value) => platformPageTimestamp(value, 'last identity transition'));
    let totalReceived = 0n;
    let totalSent = 0n;
    let incomingCount = 0;
    let outgoingCount = 0;
    let processed = 0;
    const integrity = new IdentityPageIntegrity('identity transfers', 'transfers', expectedTransfers);
    const total = expectedTransfers;
    for (let pageNumber = 1; processed < total; pageNumber += 1) {
      if (pageNumber > Math.ceil(PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS / PLATFORM_HISTORY_PAGE_SIZE))
        throw new Error('Platform identity transfer history exceeded its safety ceiling.');
      const page = platformPageItems(
        await request(
          `${endpoint}/identity/${encodeURIComponent(identifier)}/transfers?page=${pageNumber}&limit=${PLATFORM_HISTORY_PAGE_SIZE}&order=asc`,
        ),
        'identity transfer page',
      );
      integrity.accept(page.items, page.total, PLATFORM_HISTORY_PAGE_SIZE, PLATFORM_IDENTITY_HISTORY_MAX_TRANSFERS);
      for (const transfer of page.items) {
        const amount = BigInt(platformDecimal(transfer.amount, 'identity transfer amount'));
        if (transfer.recipient === identifier) {
          totalReceived += amount;
          incomingCount += 1;
        }
        if (transfer.sender === identifier) {
          totalSent += amount;
          outgoingCount += 1;
        }
      }
      processed += page.items.length;
      if (page.items.length === 0 && processed < total)
        throw new Error('Platform Explorer truncated identity transfer history.');
    }
    return {
      resource: identifier,
      balance: platformDecimal(info.balance, 'identity balance'),
      transactionCount,
      incomingCount,
      outgoingCount,
      totalReceived: totalReceived.toString(),
      totalSent: totalSent.toString(),
      totalFees: platformDecimal(info.totalGasSpent, 'identity fees', true),
      firstSeen,
      lastSeen,
      indexedHeight,
      ...(typeof info.fundingCoreTx === 'string' && TRANSACTION_HASH_PATTERN.test(info.fundingCoreTx)
        ? { fundingCoreTx: info.fundingCoreTx }
        : {}),
    };
  }

  async shieldedPage(
    network: RecoveryNetwork,
    startPosition: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<ShieldedPageView> {
    throwIfRecoveryAborted(signal);
    assertNetwork(network);
    if (!POOL_POSITION_PATTERN.test(startPosition))
      throw new Error('Network Worker rejected an invalid Orchard pool position.');
    if (!Number.isSafeInteger(count) || count < 1 || count > 8192) {
      throw new Error('Network Worker requires an Orchard page size from 1 to 8192.');
    }
    const response = await this.#proofWithExplicitRetry(
      network,
      'shielded',
      (sdk) => sdk.shielded.encryptedNotesWithProof(BigInt(startPosition), count),
      signal,
    );
    const metadata = response.metadata;
    try {
      const notes = response.data.map((note: ShieldedEncryptedNote) => copyAndFreeEvoShieldedNote(note));
      return { notes, metadata: metadataView(metadata) };
    } finally {
      metadata.free();
      response.free();
    }
  }
}
