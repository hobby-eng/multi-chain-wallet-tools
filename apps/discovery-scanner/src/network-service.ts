import { EvoSDK, type Identity, type ShieldedEncryptedNote } from '@dashevo/evo-sdk';
import { copyAndFreeEvoShieldedNote } from '@ckd/dash-network/evo-shielded-note.js';
import { validateCoreP2pkhAddress, validatePlatformP2pkhAddress } from '@ckd/dash-network/public-address.js';
import type {
  IdentityLookupView,
  PlatformAddressBatchView,
  PlatformHistorySummaryView,
  ProofMetadataView,
  RecoveryNetworkApi,
  RecoveryNetworkRequest,
  ShieldedPageView,
} from './network-protocol.js';
import {
  RECOVERY_CORE_ADDRESS_BATCH,
  RECOVERY_CORE_ENDPOINTS,
  RECOVERY_PLATFORM_ADDRESS_BATCH,
} from './network-protocol.js';
import type { RecoveryNetwork } from './types.js';
import { describeUnknownError, freeThrownValue } from './error-message.js';

const PUBLIC_KEY_HASH_PATTERN = /^[0-9a-f]{40}$/u;
const TRANSACTION_HASH_PATTERN = /^[0-9a-f]{64}$/u;
const PLATFORM_IDENTIFIER_PATTERN = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{44}$/u;
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const PLATFORM_HISTORY_PAGE_SIZE = 100;
const PLATFORM_HISTORY_MAX_PAGES = 10_000;
const PLATFORM_EXPLORER_ENDPOINTS: Record<RecoveryNetwork, string> = {
  mainnet: 'https://platform-explorer.pshenmic.dev',
  testnet: 'https://testnet.platform-explorer.pshenmic.dev',
};
const PRIMARY_HTTP_TIMEOUT_MS = 30_000;
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

function assertNetwork(value: unknown): asserts value is RecoveryNetwork {
  if (value !== 'mainnet' && value !== 'testnet') throw new Error('Network Worker rejected an unsupported network.');
}

function assertAddressBatch(
  addresses: unknown,
  network: RecoveryNetwork,
  validate: (address: string, network: RecoveryNetwork) => string,
  label: string,
  maximum: number,
): asserts addresses is string[] {
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > maximum) {
    throw new Error(`Network Worker requires 1 to ${maximum} ${label} addresses per request.`);
  }
  for (const address of addresses) {
    if (typeof address !== 'string') throw new Error(`Network Worker rejected an invalid ${label} address.`);
    try {
      if (validate(address, network) !== address) throw new Error('Address normalization changed the value.');
    } catch {
      throw new Error(`Network Worker rejected an invalid ${label} address.`);
    }
  }
}

function assertSingleAddress(
  address: unknown,
  network: RecoveryNetwork,
  validate: (value: string, network: RecoveryNetwork) => string,
  label: string,
): asserts address is string {
  if (typeof address !== 'string') throw new Error(`Network Worker rejected an invalid ${label} address.`);
  try {
    if (validate(address, network) !== address) throw new Error('Address normalization changed the value.');
  } catch {
    throw new Error(`Network Worker rejected an invalid ${label} address.`);
  }
}

function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Platform Explorer returned malformed ${context}.`);
  }
  return value as Record<string, unknown>;
}

function decimal(value: unknown, context: string, nullAsZero = false): string {
  if (nullAsZero && (value === null || value === undefined)) return '0';
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !DECIMAL_PATTERN.test(text)) {
    throw new Error(`Platform Explorer returned an invalid ${context}.`);
  }
  return text;
}

function unsignedInteger(value: unknown, context: string): number {
  const numeric = typeof value === 'string' && DECIMAL_PATTERN.test(value) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`Platform Explorer returned an invalid ${context}.`);
  }
  return numeric;
}

function timestamp(value: unknown, context: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Platform Explorer returned an invalid ${context}.`);
  }
  return value;
}

function pageItems(value: unknown, context: string): { items: Record<string, unknown>[]; total: number } {
  const page = record(value, context);
  if (!Array.isArray(page.resultSet)) throw new Error(`Platform Explorer ${context} omitted its result set.`);
  const items = page.resultSet.map((item) => record(item, `${context} item`));
  const pagination = record(page.pagination, `${context} pagination`);
  return { items, total: unsignedInteger(pagination.total, `${context} total`) };
}

function pageTimestamp(value: unknown, context: string): string | null {
  const { items } = pageItems(value, context);
  if (items.length === 0) return null;
  return timestamp(items[0]?.timestamp, `${context} timestamp`);
}

function hexToBytes(hex: string): Uint8Array {
  if (!PUBLIC_KEY_HASH_PATTERN.test(hex)) throw new Error('Network Worker requires a 20-byte lowercase public-key hash.');
  const bytes = new Uint8Array(20);
  for (let offset = 0; offset < bytes.length; offset += 1) {
    bytes[offset] = Number.parseInt(hex.slice(offset * 2, offset * 2 + 2), 16);
  }
  return bytes;
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

function abortError(): DOMException {
  return new DOMException('Recovery network operation cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

async function waitBeforeProofRetry(attempt: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, EVO_RETRY_DELAY_MS * attempt);
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    // Close the narrow check/listener race: AbortSignal does not replay an
    // abort event to a listener installed just after it fired.
    if (signal?.aborted === true) onAbort();
  });
}

function isNonRetriableProofFailure(message: string): boolean {
  return /invalid argument|malformed|out of range|unsupported|rejected an invalid/iu.test(message);
}

async function fetchJson(
  url: string,
  signal?: AbortSignal,
  init: RequestInit = {},
  timeoutMs = PRIMARY_HTTP_TIMEOUT_MS,
): Promise<unknown> {
  throwIfAborted(signal);
  const requestController = new AbortController();
  let timedOut = false;
  const abortFromCaller = (): void => requestController.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, timeoutMs);
  try {
    const response = await globalThis.fetch(url, { ...init, signal: requestController.signal });
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      throw new Error(`Network request failed with HTTP ${response.status}${detail ? ` — ${detail}` : ''}.`);
    }
    return response.json() as Promise<unknown>;
  } catch (cause) {
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new Error(`Network request timed out after ${Math.ceil(timeoutMs / 1_000)} seconds.`);
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

export class DirectRecoveryNetworkService implements RecoveryNetworkApi {
  readonly #sdkByNetworkAndPurpose = new Map<string, Promise<EvoSDK>>();
  readonly #platformExplorerHeightByNetwork = new Map<RecoveryNetwork, Promise<number>>();

  #platformExplorerHeight(network: RecoveryNetwork, signal?: AbortSignal): Promise<number> {
    const existing = this.#platformExplorerHeightByNetwork.get(network);
    if (existing !== undefined) return existing;
    const endpoint = PLATFORM_EXPLORER_ENDPOINTS[network];
    const loading = (async (): Promise<number> => {
      const status = record(await fetchJson(`${endpoint}/status`, signal), 'status');
      const indexer = record(status.indexer, 'indexer status');
      if (indexer.status !== 'synced') throw new Error('Platform Explorer index is not synchronized.');
      const reportedNetwork = typeof status.network === 'string' ? status.network : '';
      if (network === 'testnet' ? !/testnet/iu.test(reportedNetwork) : /testnet/iu.test(reportedNetwork)) {
        throw new Error('Platform Explorer returned status for the wrong network.');
      }
      const api = record(status.api, 'API status');
      return unsignedInteger(record(api.block, 'latest block').height, 'latest indexed height');
    })();
    this.#platformExplorerHeightByNetwork.set(network, loading);
    void loading.catch(() => {
      if (this.#platformExplorerHeightByNetwork.get(network) === loading) {
        this.#platformExplorerHeightByNetwork.delete(network);
      }
    });
    return loading;
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
      const sdk = network === 'mainnet'
        ? EvoSDK.mainnetTrusted({ settings })
        : EvoSDK.testnetTrusted({ settings });
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
      throwIfAborted(signal);
      let sdk: EvoSDK | undefined;
      let sdkPromise: Promise<EvoSDK> | undefined;
      try {
        sdkPromise = this.#sdk(network, purpose);
        sdk = await sdkPromise;
        throwIfAborted(signal);
        return await run(sdk);
      } catch (cause) {
        if (signal?.aborted === true) throw abortError();
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
          throw new Error(`Proof query failed after ${EVO_EXPLICIT_ATTEMPTS} bounded attempts (${failures.join('; ')}).`);
        }
        await waitBeforeProofRetry(attempt, signal);
      }
    }
    throw new Error('Proof query exhausted its bounded retry state.');
  }

  async ping(signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    return 'isolated-network-worker-v1';
  }

  async coreStatus(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    return fetchJson(`${RECOVERY_CORE_ENDPOINTS[network]}/status`, signal);
  }

  async coreTip(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    return fetchJson(`${RECOVERY_CORE_ENDPOINTS[network]}/blocks?page=1&limit=1&order=desc`, signal);
  }

  async coreAddressInfo(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    assertAddressBatch(addresses, network, validateCoreP2pkhAddress, 'Dash Core P2PKH', RECOVERY_CORE_ADDRESS_BATCH);
    return fetchJson(`${RECOVERY_CORE_ENDPOINTS[network]}/addresses/info?addresses=${addresses.map(encodeURIComponent).join(',')}`, signal);
  }

  async coreAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<unknown> {
    assertNetwork(network);
    assertSingleAddress(address, network, validateCoreP2pkhAddress, 'Dash Core P2PKH');
    const historyValue = await fetchJson(`${RECOVERY_CORE_ENDPOINTS[network]}/address/${encodeURIComponent(address)}`, signal);
    if (typeof historyValue !== 'object' || historyValue === null || Array.isArray(historyValue)) return historyValue;
    const history = historyValue as Record<string, unknown>;
    // DashScan currently leaves firstSeenBlock/Timestamp null for some
    // special-transaction outputs (for example Asset Unlock), while retaining
    // the authoritative firstSeenTx hash. Resolve that transaction through the
    // same source so the public recovery record still gets its first date.
    if ((typeof history.firstSeenBlockTimestamp === 'string' && Number.isFinite(Date.parse(history.firstSeenBlockTimestamp)))
      || typeof history.firstSeenTx !== 'string'
      || !TRANSACTION_HASH_PATTERN.test(history.firstSeenTx)) return historyValue;
    const transactionValue = await fetchJson(
      `${RECOVERY_CORE_ENDPOINTS[network]}/transaction/${encodeURIComponent(history.firstSeenTx)}`,
      signal,
    );
    if (typeof transactionValue !== 'object' || transactionValue === null || Array.isArray(transactionValue)) return historyValue;
    const transaction = transactionValue as Record<string, unknown>;
    if (transaction.hash !== history.firstSeenTx) return historyValue;
    const timestamp = transaction.timestamp;
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) return historyValue;
    return { ...history, firstSeenBlockTimestamp: timestamp };
  }

  async platformAddresses(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<PlatformAddressBatchView> {
    throwIfAborted(signal);
    assertNetwork(network);
    assertAddressBatch(addresses, network, validatePlatformP2pkhAddress, 'Dash Platform P2PKH', RECOVERY_PLATFORM_ADDRESS_BATCH);
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
    const info = record(await fetchJson(`${endpoint}/platformAddress/${encodeURIComponent(address)}/info`, signal), 'address info');
    if (info.bech32mAddress !== address) throw new Error('Platform Explorer address info did not match the requested address.');
    const transactionCount = unsignedInteger(info.totalTxs, 'address transaction count');
    const [firstSeen, lastSeen] = transactionCount === 0 ? [null, null] : await Promise.all([
      fetchJson(`${endpoint}/platformAddress/${encodeURIComponent(address)}/transactions?page=1&limit=1&order=asc`, signal)
        .then((value) => pageTimestamp(value, 'first address transition')),
      fetchJson(`${endpoint}/platformAddress/${encodeURIComponent(address)}/transactions?page=1&limit=1&order=desc`, signal)
        .then((value) => pageTimestamp(value, 'last address transition')),
    ]);
    return {
      resource: address,
      balance: decimal(info.balance, 'address balance'),
      transactionCount,
      incomingCount: unsignedInteger(info.incomingTxs, 'incoming address transition count'),
      outgoingCount: unsignedInteger(info.outgoingTxs, 'outgoing address transition count'),
      totalReceived: decimal(info.totalIncomingAmount, 'total incoming amount', true),
      totalSent: decimal(info.totalOutgoingAmount, 'total outgoing amount', true),
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
    throwIfAborted(signal);
    assertNetwork(network);
    const publicKeyHash = hexToBytes(publicKeyHashHex);
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
      if (uniqueIdentity !== undefined && uniqueIdentity !== null) {
        try {
          return {
            identities: [identityView(uniqueIdentity)],
            metadata: metadataView(uniqueMetadata),
            proofQueries: 1,
            dapiDurationsMs: durations,
          };
        } finally {
          uniqueIdentity.free();
        }
      }
    } finally {
      uniqueMetadata.free();
      uniqueResponse.free();
    }
    throwIfAborted(signal);
    const nonUniqueStarted = performance.now();
    const nonUniqueResponse = await this.#proofWithExplicitRetry(
      network,
      'identity',
      (sdk) => sdk.identities.byNonUniquePublicKeyHashWithProof(publicKeyHash),
      signal,
    );
    durations.push(performance.now() - nonUniqueStarted);
    const nonUniqueMetadata = nonUniqueResponse.metadata;
    try {
      const identities = nonUniqueResponse.data.map((identity: Identity) => {
        try {
          return identityView(identity);
        } finally {
          identity.free();
        }
      });
      return {
        identities,
        metadata: metadataView(nonUniqueMetadata),
        proofQueries: 2,
        dapiDurationsMs: durations,
      };
    } finally {
      nonUniqueMetadata.free();
      nonUniqueResponse.free();
    }
  }

  async platformIdentityHistory(
    network: RecoveryNetwork,
    identifier: string,
    signal?: AbortSignal,
  ): Promise<PlatformHistorySummaryView> {
    assertNetwork(network);
    if (!PLATFORM_IDENTIFIER_PATTERN.test(identifier)) throw new Error('Network Worker rejected an invalid Platform identity.');
    const endpoint = PLATFORM_EXPLORER_ENDPOINTS[network];
    const indexedHeight = await this.#platformExplorerHeight(network, signal);
    const info = record(await fetchJson(`${endpoint}/identity/${encodeURIComponent(identifier)}`, signal), 'identity info');
    if (info.identifier !== identifier) throw new Error('Platform Explorer identity info did not match the requested identity.');
    const transactionCount = unsignedInteger(info.totalTxs, 'identity transaction count');
    const firstSeen = timestamp(info.timestamp, 'identity first-seen timestamp');
    const lastSeen = transactionCount === 0 ? firstSeen : await fetchJson(
      `${endpoint}/identity/${encodeURIComponent(identifier)}/transactions?page=1&limit=1&order=desc`,
      signal,
    ).then((value) => pageTimestamp(value, 'last identity transition'));
    let totalReceived = 0n;
    let totalSent = 0n;
    let incomingCount = 0;
    let outgoingCount = 0;
    let processed = 0;
    let total = 1;
    for (let pageNumber = 1; processed < total; pageNumber += 1) {
      if (pageNumber > PLATFORM_HISTORY_MAX_PAGES) throw new Error('Platform identity transfer history exceeded its safety ceiling.');
      const page = pageItems(await fetchJson(
        `${endpoint}/identity/${encodeURIComponent(identifier)}/transfers?page=${pageNumber}&limit=${PLATFORM_HISTORY_PAGE_SIZE}&order=asc`,
        signal,
      ), 'identity transfer page');
      total = page.total;
      for (const transfer of page.items) {
        const amount = BigInt(decimal(transfer.amount, 'identity transfer amount'));
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
      if (page.items.length === 0 && processed < total) throw new Error('Platform Explorer truncated identity transfer history.');
    }
    return {
      resource: identifier,
      balance: decimal(info.balance, 'identity balance'),
      transactionCount,
      incomingCount,
      outgoingCount,
      totalReceived: totalReceived.toString(),
      totalSent: totalSent.toString(),
      totalFees: decimal(info.totalGasSpent, 'identity fees', true),
      firstSeen,
      lastSeen,
      indexedHeight,
    };
  }

  async shieldedPage(
    network: RecoveryNetwork,
    startPosition: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<ShieldedPageView> {
    throwIfAborted(signal);
    assertNetwork(network);
    if (!DECIMAL_PATTERN.test(startPosition)) throw new Error('Network Worker rejected an invalid Orchard pool position.');
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

export async function executeRecoveryNetworkRequest(
  service: RecoveryNetworkApi,
  request: RecoveryNetworkRequest,
  signal?: AbortSignal,
): Promise<unknown> {
  switch (request.operation) {
    case 'ping': return service.ping(signal);
    case 'core.status': return service.coreStatus(request.payload.network, signal);
    case 'core.tip': return service.coreTip(request.payload.network, signal);
    case 'core.address-info': return service.coreAddressInfo(request.payload.network, request.payload.addresses, signal);
    case 'core.address-history': return service.coreAddressHistory(request.payload.network, request.payload.address, signal);
    case 'platform.addresses': return service.platformAddresses(request.payload.network, request.payload.addresses, signal);
    case 'platform.address-history': return service.platformAddressHistory(request.payload.network, request.payload.address, signal);
    case 'platform.identity-by-public-key-hash': return service.platformIdentityByPublicKeyHash(
      request.payload.network,
      request.payload.publicKeyHashHex,
      signal,
    );
    case 'platform.identity-history': return service.platformIdentityHistory(
      request.payload.network,
      request.payload.identifier,
      signal,
    );
    case 'shielded.page': return service.shieldedPage(
      request.payload.network,
      request.payload.startPosition,
      request.payload.count,
      signal,
    );
    default: throw new Error('Recovery Network Worker rejected an unsupported operation.');
  }
}
