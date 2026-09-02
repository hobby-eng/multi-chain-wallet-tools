import { validatePlatformAddress } from './public-address.js';
import { requireRecord } from '@ckd/core/records.js';
import type { ViewerNetwork } from './types.js';

const EXPLORER_PAGE_SIZE = 100;

export interface PlatformAddressTransition {
  hash: string;
  incoming: boolean;
  type: string;
  batchType: string | null;
  status: string;
  error: string | null;
  timestampMs: number | null;
  blockHeight: number | null;
  blockHash: string | null;
  gasUsed: bigint | null;
}

export interface PlatformAddressHistorySnapshot {
  provider: string;
  address: string;
  base58Address: string | null;
  totalTransitions: number;
  incomingTransitions: number;
  outgoingTransitions: number;
  totalIncomingCredits: bigint;
  totalOutgoingCredits: bigint;
  explorerBalanceCredits: bigint;
  explorerNonce: number;
  transitions: PlatformAddressTransition[];
  historyLimit: number;
  endpoint: string;
  indexStatus: 'synced';
  indexedHeight: number;
  indexedTimeMs: number;
  requests: number;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PlatformHistoryProvider {
  readonly id: string;
  readonly displayName: string;
  endpoint(network: ViewerNetwork): string;
  query(
    address: string,
    network: ViewerNetwork,
    historyLimit: number,
    signal: AbortSignal | undefined,
    fetcher: FetchLike,
  ): Promise<PlatformAddressHistorySnapshot>;
}

const PLATFORM_EXPLORER_ENDPOINTS: Record<ViewerNetwork, string> = {
  mainnet: 'https://platform-explorer.pshenmic.dev',
  testnet: 'https://testnet.platform-explorer.pshenmic.dev',
};

function object(value: unknown, context: string): Record<string, unknown> {
  return requireRecord(value, `Platform Explorer returned malformed ${context}.`);
}

function optionalInteger(value: unknown): number | null {
  const number = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function requiredInteger(value: unknown, context: string): number {
  const number = optionalInteger(value);
  if (number === null) throw new Error(`Platform Explorer returned an invalid ${context}.`);
  return number;
}

function exactCredits(value: unknown, context: string, nullAsZero = false): bigint {
  if (nullAsZero && (value === null || value === undefined)) return 0n;
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?\d+$/u.test(value)) return BigInt(value);
  throw new Error(`Platform Explorer returned an invalid ${context}.`);
}

class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function fetchJson(fetcher: FetchLike, url: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, signal === undefined ? undefined : { signal });
  if (!response.ok) {
    throw new ProviderHttpError(response.status, `Platform Explorer request failed with HTTP ${response.status}.`);
  }
  return response.json() as Promise<unknown>;
}

function transitionView(value: unknown): PlatformAddressTransition {
  const transition = object(value, 'address transition');
  const timestampMs = typeof transition.timestamp === 'string' ? Date.parse(transition.timestamp) : Number.NaN;
  const gasUsed = transition.gasUsed === null || transition.gasUsed === undefined
    ? null
    : exactCredits(transition.gasUsed, 'transition gas');
  return {
    hash: typeof transition.hash === 'string' ? transition.hash : 'unknown',
    incoming: transition.incoming === true,
    type: typeof transition.type === 'string' ? transition.type : 'UNKNOWN',
    batchType: typeof transition.batchType === 'string' ? transition.batchType : null,
    status: typeof transition.status === 'string' ? transition.status : 'UNKNOWN',
    error: typeof transition.error === 'string' ? transition.error : null,
    timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
    blockHeight: optionalInteger(transition.blockHeight),
    blockHash: typeof transition.blockHash === 'string' ? transition.blockHash : null,
    gasUsed,
  };
}

async function queryPlatformExplorer(
  address: string,
  network: ViewerNetwork,
  historyLimit: number,
  signal: AbortSignal | undefined,
  fetcher: FetchLike,
): Promise<PlatformAddressHistorySnapshot> {
  const endpoint = PLATFORM_EXPLORER_ENDPOINTS[network];
  let requests = 1;
  const status = object(await fetchJson(fetcher, `${endpoint}/status`, signal), 'index status');
  const indexer = object(status.indexer, 'indexer status');
  if (indexer.status !== 'synced') {
    throw new Error('Platform Explorer reports that its index is not synchronized with Dash Platform.');
  }
  const reportedNetwork = typeof status.network === 'string' ? status.network : '';
  if (network === 'testnet' ? !/testnet/iu.test(reportedNetwork) : /testnet/iu.test(reportedNetwork)) {
    throw new Error(`Platform Explorer returned status for the wrong network (${reportedNetwork || 'unknown'}).`);
  }
  const api = object(status.api, 'API status');
  const tip = object(api.block, 'latest indexed block');
  const indexedHeight = requiredInteger(tip.height, 'latest indexed Platform height');
  const indexedTimeMs = typeof tip.timestamp === 'string' ? Date.parse(tip.timestamp) : Number.NaN;
  if (!Number.isFinite(indexedTimeMs)) {
    throw new Error('Platform Explorer returned an invalid latest indexed block time.');
  }

  requests += 1;
  const infoValue = await fetchJson(
    fetcher,
    `${endpoint}/platformAddress/${encodeURIComponent(address)}/info`,
    signal,
  ).catch((cause: unknown) => {
    if (cause instanceof ProviderHttpError && cause.status === 404) return null;
    throw cause;
  });
  if (infoValue === null) {
    return {
      provider: PLATFORM_EXPLORER_PROVIDER.displayName,
      address,
      base58Address: null,
      totalTransitions: 0,
      incomingTransitions: 0,
      outgoingTransitions: 0,
      totalIncomingCredits: 0n,
      totalOutgoingCredits: 0n,
      explorerBalanceCredits: 0n,
      explorerNonce: 0,
      transitions: [],
      historyLimit,
      endpoint,
      indexStatus: 'synced',
      indexedHeight,
      indexedTimeMs,
      requests,
    };
  }

  const info = object(infoValue, 'address info');
  let totalTransitions = requiredInteger(info.totalTxs, 'total transition count');
  const incomingTransitions = requiredInteger(info.incomingTxs, 'incoming transition count');
  const outgoingTransitions = requiredInteger(info.outgoingTxs, 'outgoing transition count');
  const transitions: PlatformAddressTransition[] = [];
  let target = Math.min(totalTransitions, historyLimit);
  for (let pageNumber = 1; transitions.length < target; pageNumber += 1) {
    const limit = Math.min(EXPLORER_PAGE_SIZE, target - transitions.length);
    requests += 1;
    const page = object(
      await fetchJson(
        fetcher,
        `${endpoint}/platformAddress/${encodeURIComponent(address)}/transactions?page=${pageNumber}&limit=${limit}&order=desc`,
        signal,
      ),
      'address-transition page',
    );
    const items = Array.isArray(page.resultSet) ? page.resultSet : [];
    const pagination = object(page.pagination, 'address-transition pagination');
    const reportedTotal = optionalInteger(pagination.total);
    if (reportedTotal !== null) totalTransitions = Math.max(totalTransitions, reportedTotal);
    target = Math.min(totalTransitions, historyLimit);
    const remaining = target - transitions.length;
    transitions.push(...items.slice(0, remaining).map(transitionView));
    if (items.length < limit) break;
  }
  return {
    provider: PLATFORM_EXPLORER_PROVIDER.displayName,
    address,
    base58Address: typeof info.base58Address === 'string' ? info.base58Address : null,
    totalTransitions,
    incomingTransitions,
    outgoingTransitions,
    totalIncomingCredits: exactCredits(info.totalIncomingAmount, 'total incoming amount', true),
    totalOutgoingCredits: exactCredits(info.totalOutgoingAmount, 'total outgoing amount', true),
    explorerBalanceCredits: exactCredits(info.balance, 'current address balance'),
    explorerNonce: requiredInteger(info.nonce, 'address nonce'),
    transitions,
    historyLimit,
    endpoint,
    indexStatus: 'synced',
    indexedHeight,
    indexedTimeMs,
    requests,
  };
}

export const PLATFORM_EXPLORER_PROVIDER: PlatformHistoryProvider = {
  id: 'platform-explorer',
  displayName: 'Dash Platform Explorer',
  endpoint(network) {
    return PLATFORM_EXPLORER_ENDPOINTS[network];
  },
  query: queryPlatformExplorer,
};

export async function queryPlatformAddressHistory(
  addressInput: string,
  network: ViewerNetwork,
  historyLimit: number,
  signal?: AbortSignal,
  fetcher: FetchLike = fetch,
  provider: PlatformHistoryProvider = PLATFORM_EXPLORER_PROVIDER,
): Promise<PlatformAddressHistorySnapshot> {
  const address = validatePlatformAddress(addressInput, network);
  if (!Number.isSafeInteger(historyLimit) || historyLimit < 1 || historyLimit > 1000) {
    throw new Error('Platform history limit must be an integer from 1 to 1000.');
  }
  return provider.query(address, network, historyLimit, signal, fetcher);
}
