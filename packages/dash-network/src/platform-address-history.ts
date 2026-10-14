import { DashHistoryBudget } from "./history-budget.js";
import { PlatformAddressHistoryAdmission } from "./platform-address-history-admission.js";
import { validateAddressHistoryPage } from "./provider-json.js";
import { validatePlatformAddress } from "./public-address.js";
import { ProviderHttpError, type FetchLike } from "./provider-http.js";
import {
  PLATFORM_EXPLORER_ENDPOINTS,
  PLATFORM_EXPLORER_HTTP,
  PLATFORM_EXPLORER_NAME,
  platformExplorerTip,
} from "./platform-explorer.js";
import type { ViewerNetwork } from "./types.js";

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
  indexStatus: "synced";
  indexedHeight: number;
  indexedTimeMs: number;
  requests: number;
}

interface PlatformHistoryProvider {
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

const {
  object,
  optionalInteger,
  requiredInteger,
  exactInteger: exactCredits,
  fetchJson,
} = PLATFORM_EXPLORER_HTTP;

function transitionView(value: unknown): PlatformAddressTransition {
  const transition = object(value, "address transition");
  const timestampMs =
    typeof transition.timestamp === "string" ? Date.parse(transition.timestamp) : Number.NaN;
  const gasUsed =
    transition.gasUsed === null || transition.gasUsed === undefined
      ? null
      : exactCredits(transition.gasUsed, "transition gas");
  return {
    hash: typeof transition.hash === "string" ? transition.hash : "unknown",
    incoming: transition.incoming === true,
    type: typeof transition.type === "string" ? transition.type : "UNKNOWN",
    batchType: typeof transition.batchType === "string" ? transition.batchType : null,
    status: typeof transition.status === "string" ? transition.status : "UNKNOWN",
    error: typeof transition.error === "string" ? transition.error : null,
    timestampMs: Number.isFinite(timestampMs) ? timestampMs : null,
    blockHeight: optionalInteger(transition.blockHeight),
    blockHash: typeof transition.blockHash === "string" ? transition.blockHash : null,
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
  const { indexedHeight, indexedTimeMs } = await platformExplorerTip(fetcher, network, signal);

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
      indexStatus: "synced",
      indexedHeight,
      indexedTimeMs,
      requests,
    };
  }

  const info = new PlatformAddressHistoryAdmission(address, network).admitInfo(infoValue);
  const totalTransitions = requiredInteger(info.totalTxs, "total transition count");
  const incomingTransitions = requiredInteger(info.incomingTxs, "incoming transition count");
  const outgoingTransitions = requiredInteger(info.outgoingTxs, "outgoing transition count");
  const transitions: PlatformAddressTransition[] = [];
  let target = Math.min(totalTransitions, historyLimit);
  // Page-number APIs calculate offsets from the requested limit. Keep it fixed.
  const limit = Math.min(EXPLORER_PAGE_SIZE, historyLimit);
  const seen = new Set<string>();
  for (let pageNumber = 1; transitions.length < target; pageNumber += 1) {
    requests += 1;
    // Platform Explorer serves an address's history at /transitions; the former /transactions
    // route now answers 404 (AUD-019-API003). Identities keep their /transactions route.
    const page = object(
      await fetchJson(
        fetcher,
        `${endpoint}/platformAddress/${encodeURIComponent(address)}/transitions?page=${pageNumber}&limit=${limit}&order=desc`,
        signal,
      ),
      "address-transition page",
    );
    const items: unknown = page.resultSet;
    const pagination = object(page.pagination, "address-transition pagination");
    validateAddressHistoryPage(items, pagination.total, totalTransitions, limit, seen);
    const fullPage = items.map(transitionView);
    target = Math.min(totalTransitions, historyLimit);
    const remaining = target - transitions.length;
    const parsed = fullPage.slice(0, remaining);
    transitions.push(...parsed);
    if (items.length < limit && transitions.length < target) {
      throw new Error(
        "Address history ended before the reported transaction count. Retry the query.",
      );
    }
  }
  return {
    provider: PLATFORM_EXPLORER_PROVIDER.displayName,
    address,
    base58Address: typeof info.base58Address === "string" ? info.base58Address : null,
    totalTransitions,
    incomingTransitions,
    outgoingTransitions,
    totalIncomingCredits: exactCredits(info.totalIncomingAmount, "total incoming amount", true),
    totalOutgoingCredits: exactCredits(info.totalOutgoingAmount, "total outgoing amount", true),
    explorerBalanceCredits: exactCredits(info.balance, "current address balance"),
    explorerNonce: requiredInteger(info.nonce, "address nonce"),
    transitions,
    historyLimit,
    endpoint,
    indexStatus: "synced",
    indexedHeight,
    indexedTimeMs,
    requests,
  };
}

const PLATFORM_EXPLORER_PROVIDER: PlatformHistoryProvider = {
  id: "platform-explorer",
  displayName: PLATFORM_EXPLORER_NAME,
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
  DashHistoryBudget.admit(historyLimit, "Platform history limit");
  return provider.query(address, network, historyLimit, signal, fetcher);
}
