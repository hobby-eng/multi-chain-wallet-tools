import { IDENTITY_CREATION_KINDS } from "./identity-transition-types.js";
import { DashHistoryBudget } from "./history-budget.js";
import { IdentityPageIntegrity } from "./identity-pagination.js";
import { ProviderHttpError, type FetchLike } from "./provider-http.js";
import {
  PLATFORM_EXPLORER_ENDPOINTS,
  PLATFORM_EXPLORER_HTTP,
  PLATFORM_EXPLORER_NAME,
  platformExplorerTip,
} from "./platform-explorer.js";
import type { ViewerNetwork } from "./types.js";
import {
  IdentityCreateTransition,
  StateTransition,
  type AssetLockProof,
  type OutPoint,
} from "@dashevo/evo-sdk";
import { PlatformIdentifier } from "./platform-identifier.js";

const EXPLORER_PAGE_SIZE = 100;
const EXPLORER_MAX_PAGES = 10_000;

import type {
  IdentityAliasHistory,
  IdentityActivityEvent,
  IdentityTransferMovement,
  IdentityDocumentHistory,
  IdentityDataContractHistory,
  IdentityWithdrawalHistory,
  IdentityTokenHistory,
  PlatformIdentityHistorySnapshot,
} from "./platform-identity-history-model.js";
export type {
  IdentityActivityEvent,
  IdentityDocumentHistory,
  IdentityDataContractHistory,
  IdentityWithdrawalHistory,
  IdentityTokenHistory,
  PlatformIdentityHistoryResult,
} from "./platform-identity-history-model.js";
interface ExplorerPage {
  items: Record<string, unknown>[];
  total: number | null;
}

interface PlatformIdentityHistoryProvider {
  readonly displayName: string;
  endpoint(network: ViewerNetwork): string;
}

interface ClassicIdentityFunding {
  coreTransactionHash: string;
  outputIndex: number;
  lockType: "instant" | "chain";
}

type ClassicIdentityFundingDecoder = (base64: string) => ClassicIdentityFunding;

const PLATFORM_IDENTITY_HISTORY_PROVIDER: PlatformIdentityHistoryProvider = {
  displayName: PLATFORM_EXPLORER_NAME,
  endpoint(network) {
    return PLATFORM_EXPLORER_ENDPOINTS[network];
  },
};

const { object, optionalInteger, requiredInteger, exactInteger, fetchJson } =
  PLATFORM_EXPLORER_HTTP;

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function boolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalExactInteger(value: unknown, context: string): bigint | null {
  if (value === null || value === undefined) return null;
  return exactInteger(value, context);
}

function page(value: unknown, context: string): ExplorerPage {
  const response = object(value, context);
  if (!Array.isArray(response.resultSet)) {
    throw new Error(`Platform Explorer ${context} omitted its result set.`);
  }
  const pagination = object(response.pagination, `${context} pagination`);
  const rawTotal = optionalInteger(pagination.total);
  return {
    items: response.resultSet.map((item) => object(item, `${context} item`)),
    total: rawTotal === null || rawTotal < 0 ? null : rawTotal,
  };
}

function aliasView(value: unknown): IdentityAliasHistory {
  const alias = object(value, "identity alias");
  const name = text(alias.alias);
  if (name === null)
    throw new Error("Platform Explorer returned an identity alias without a name.");
  return {
    name,
    status: text(alias.status) ?? "unknown",
    contested: alias.contested === true,
    timestampMs: timestamp(alias.timestamp),
    transactionHash: text(alias.txHash),
    documentId: text(alias.documentId),
  };
}

function transactionEvent(value: Record<string, unknown>): IdentityActivityEvent {
  const transactionHash = text(value.hash);
  if (transactionHash === null)
    throw new Error("Platform Explorer returned a transaction without a hash.");
  return {
    transactionHash,
    type: text(value.type) ?? "UNKNOWN",
    batchType: text(value.batchType),
    status: text(value.status),
    error: text(value.error),
    timestampMs: timestamp(value.timestamp),
    blockHeight: optionalInteger(value.blockHeight),
    blockHash: text(value.blockHash),
    gasUsedCredits: optionalExactInteger(value.gasUsed, "identity transaction gas"),
    direction: "related",
    netAmountCredits: null,
    transfers: [],
  };
}

function creationTransaction(
  transactions: Record<string, unknown>[],
): Record<string, unknown> | null {
  return (
    transactions.find((transaction) => {
      const type = text(transaction.type);
      return type !== null && IDENTITY_CREATION_KINDS.isExplorerType(type);
    }) ?? null
  );
}

function decodeClassicIdentityFunding(base64: string): ClassicIdentityFunding {
  let stateTransition: StateTransition | null = null;
  let identityCreateTransition: IdentityCreateTransition | null = null;
  let assetLockProof: AssetLockProof | null = null;
  let outPoint: OutPoint | null = null;
  try {
    stateTransition = StateTransition.fromBase64(base64);
    identityCreateTransition = IdentityCreateTransition.fromStateTransition(stateTransition);
    assetLockProof = identityCreateTransition.assetLockProof;
    outPoint = assetLockProof.outPoint ?? null;
    if (outPoint === null) throw new Error("asset-lock outpoint is absent");
    const coreTransactionHash = outPoint.txid;
    const outputIndex = outPoint.vout;
    const lockType = assetLockProof.lockType;
    if (!/^[0-9a-f]{64}$/iu.test(coreTransactionHash)) {
      throw new Error("asset-lock transaction ID is invalid");
    }
    if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) {
      throw new Error("asset-lock output index is invalid");
    }
    if (lockType !== "instant" && lockType !== "chain") {
      throw new Error("asset-lock proof type is invalid");
    }
    return { coreTransactionHash, outputIndex, lockType };
  } finally {
    outPoint?.free();
    assetLockProof?.free();
    identityCreateTransition?.free();
    stateTransition?.free();
  }
}

function registrationFundingSource(
  registrationType: string | null,
  fundingCoreTransactionHash: string | null,
): PlatformIdentityHistorySnapshot["registrationFundingSource"] {
  if (registrationType === "IDENTITY_CREATE") return "core-asset-lock";
  if (registrationType === "IDENTITY_CREATE_FROM_ADDRESSES") return "platform-addresses";
  if (registrationType === "IDENTITY_CREATE_FROM_SHIELDED_POOL") return "shielded-pool";
  return fundingCoreTransactionHash === null ? "unknown" : "core-asset-lock";
}

function transferMovement(
  value: Record<string, unknown>,
  identifier: string,
): { transactionHash: string; movement: IdentityTransferMovement; event: IdentityActivityEvent } {
  const transactionHash = text(value.txHash);
  if (transactionHash === null)
    throw new Error("Platform Explorer returned a transfer without a transaction hash.");
  const sender = text(value.sender);
  const recipient = text(value.recipient);
  const direction =
    sender === identifier && recipient === identifier
      ? "self"
      : recipient === identifier
        ? "incoming"
        : sender === identifier
          ? "outgoing"
          : "related";
  const amountCredits = exactInteger(value.amount, "identity transfer amount");
  const movement: IdentityTransferMovement = { direction, amountCredits, sender, recipient };
  return {
    transactionHash,
    movement,
    event: {
      transactionHash,
      type: text(value.type) ?? "UNKNOWN",
      batchType: null,
      status: null,
      error: null,
      timestampMs: timestamp(value.timestamp),
      blockHeight: null,
      blockHash: text(value.blockHash),
      gasUsedCredits: optionalExactInteger(value.gasUsed, "identity transfer gas"),
      direction,
      netAmountCredits:
        direction === "incoming" ? amountCredits : direction === "outgoing" ? -amountCredits : 0n,
      transfers: [movement],
    },
  };
}

function combinedDirection(
  transfers: IdentityTransferMovement[],
): IdentityActivityEvent["direction"] {
  const directions = new Set(transfers.map(({ direction }) => direction));
  if (directions.size === 1) return transfers[0]?.direction ?? "related";
  if (directions.has("incoming") && directions.has("outgoing")) return "self";
  if (directions.has("incoming")) return "incoming";
  if (directions.has("outgoing")) return "outgoing";
  return directions.has("self") ? "self" : "related";
}

function netTransferAmount(transfers: IdentityTransferMovement[]): bigint {
  return transfers.reduce((total, transfer) => {
    if (transfer.direction === "incoming") return total + transfer.amountCredits;
    if (transfer.direction === "outgoing") return total - transfer.amountCredits;
    return total;
  }, 0n);
}

function mergeActivity(
  transactions: Record<string, unknown>[],
  transfers: Record<string, unknown>[],
  identifier: string,
): IdentityActivityEvent[] {
  const merged = new Map<string, IdentityActivityEvent>();
  for (const transaction of transactions) {
    const event = transactionEvent(transaction);
    merged.set(event.transactionHash, event);
  }
  for (const transfer of transfers) {
    const { transactionHash, movement, event } = transferMovement(transfer, identifier);
    const transition = merged.get(transactionHash);
    const combinedTransfers =
      transition === undefined ? [movement] : [...transition.transfers, movement];
    merged.set(
      transactionHash,
      transition === undefined
        ? event
        : {
            ...transition,
            type: transition.type === "UNKNOWN" ? event.type : transition.type,
            timestampMs: transition.timestampMs ?? event.timestampMs,
            blockHash: transition.blockHash ?? event.blockHash,
            gasUsedCredits: transition.gasUsedCredits ?? event.gasUsedCredits,
            direction: combinedDirection(combinedTransfers),
            netAmountCredits: netTransferAmount(combinedTransfers),
            transfers: combinedTransfers,
          },
    );
  }
  return [...merged.values()].sort((left, right) => {
    const leftTime = left.timestampMs ?? Number.MIN_SAFE_INTEGER;
    const rightTime = right.timestampMs ?? Number.MIN_SAFE_INTEGER;
    return rightTime - leftTime || right.transactionHash.localeCompare(left.transactionHash);
  });
}

function documentView(value: Record<string, unknown>): IdentityDocumentHistory {
  const identifier = text(value.identifier);
  if (identifier === null)
    throw new Error("Platform Explorer returned a document without an identifier.");
  return {
    identifier,
    dataContractIdentifier: text(value.dataContractIdentifier),
    documentTypeName: text(value.documentTypeName) ?? text(value.typeName),
    revision: optionalInteger(value.revision),
    transactionHash: text(value.txHash),
    timestampMs: timestamp(value.timestamp),
    deleted: value.deleted === true,
    system: value.system === true || value.isSystem === true,
  };
}

function contractView(value: Record<string, unknown>): IdentityDataContractHistory {
  const identifier = text(value.identifier);
  if (identifier === null)
    throw new Error("Platform Explorer returned a data contract without an identifier.");
  return {
    identifier,
    name: text(value.name),
    version: optionalInteger(value.version),
    transactionHash: text(value.txHash),
    timestampMs: timestamp(value.timestamp),
    system: value.isSystem === true,
    documentsCount: optionalInteger(value.documentsCount),
    tokensCount: optionalInteger(value.tokensCount),
    description: text(value.description),
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function withdrawalView(value: Record<string, unknown>): IdentityWithdrawalHistory {
  const documentId = text(value.document);
  if (documentId === null)
    throw new Error("Platform Explorer returned a withdrawal without a document identifier.");
  return {
    documentId,
    status: text(value.status) ?? "UNKNOWN",
    amountCredits: exactInteger(value.amount, "withdrawal amount"),
    timestampMs: timestamp(value.timestamp),
    withdrawalAddress: text(value.withdrawalAddress),
    coreTransactionHash: text(value.hash),
  };
}

function tokenName(value: Record<string, unknown>): string | null {
  const localizations = value.localizations;
  if (typeof localizations !== "object" || localizations === null || Array.isArray(localizations))
    return null;
  const english = (localizations as Record<string, unknown>).en;
  if (typeof english !== "object" || english === null || Array.isArray(english)) return null;
  const localized = english as Record<string, unknown>;
  return text(localized.singularForm) ?? text(localized.pluralForm);
}

function tokenView(value: Record<string, unknown>): IdentityTokenHistory {
  const identifier = text(value.identifier);
  if (identifier === null)
    throw new Error("Platform Explorer returned a token without an identifier.");
  return {
    identifier,
    dataContractIdentifier: text(value.dataContractIdentifier),
    position: optionalInteger(value.position),
    name: tokenName(value),
    description: text(value.description),
    baseSupply: optionalExactInteger(value.baseSupply, "token base supply"),
    totalSupply: optionalExactInteger(value.totalSupply, "token total supply"),
    maxSupply: optionalExactInteger(value.maxSupply, "token maximum supply"),
    decimals: optionalInteger(value.decimals),
    mintable: boolean(value.mintable),
    burnable: boolean(value.burnable),
    freezable: boolean(value.freezable),
    destroyable: boolean(value.destroyable),
    timestampMs: timestamp(value.timestamp),
  };
}

async function paginatedItems(
  fetcher: FetchLike,
  endpoint: string,
  path: string,
  historyLimit: number,
  context: string,
  signal: AbortSignal | undefined,
  onRequest: () => void,
  kind: "transactions" | "transfers" | "resources",
  expected: number | null,
  warnings: string[],
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  const limit = Math.min(EXPLORER_PAGE_SIZE, historyLimit);
  const integrity = new IdentityPageIntegrity(context, kind, expected);
  for (let pageNumber = 1; items.length < historyLimit; pageNumber += 1) {
    if (pageNumber > EXPLORER_MAX_PAGES)
      throw new Error(`Platform Explorer ${context} exceeded its pagination safety ceiling.`);
    onRequest();
    const response = page(
      await fetchJson(
        fetcher,
        `${endpoint}${path}?page=${pageNumber}&limit=${limit}&order=desc`,
        signal,
      ),
      context,
    );
    integrity.accept(response.items, response.total, limit, historyLimit);
    items.push(...response.items.slice(0, historyLimit - items.length));
    if (
      response.items.length < limit ||
      (integrity.total !== null && items.length >= integrity.total)
    )
      break;
  }
  if (integrity.total === null)
    warnings.push(
      `${context}: provider did not report a total count; collection completeness is unverified.`,
    );
  else if (items.length < integrity.total)
    warnings.push(
      `${context}: showing ${items.length} of ${integrity.total} records (display limit).`,
    );
  return items;
}

const HISTORY_ERRORS = {
  "identity.history.used": "This Identity history request has already started.",
  "identity.history.resource":
    "Platform Explorer identity info did not match the requested Identity.",
  "identity.history.registration":
    "Platform Explorer returned an Identity creation transition without a hash.",
} as const;

/** Stable refusals from the indexed-history request owner. */
export type PlatformIdentityHistoryErrorCode = keyof typeof HISTORY_ERRORS;

/** Refuses invalid request use or conflicting provider resources without echoing their content. */
export class PlatformIdentityHistoryError extends Error {
  constructor(readonly code: PlatformIdentityHistoryErrorCode) {
    super(HISTORY_ERRORS[code]);
    this.name = "PlatformIdentityHistoryError";
  }
}

interface IdentityHistoryOptions {
  readonly identifier: string;
  readonly network: ViewerNetwork;
  readonly historyLimit: number;
  readonly signal: AbortSignal | undefined;
  readonly fetcher: FetchLike;
  readonly provider: PlatformIdentityHistoryProvider;
  readonly fundingDecoder: ClassicIdentityFundingDecoder;
}

/** Owns one indexed history query, its bounded collections and request accounting. */
export class PlatformIdentityHistory {
  readonly #options: IdentityHistoryOptions;
  readonly #endpoint: string;
  #started = false;
  #requests = 0;
  readonly #request = (): void => {
    this.#requests += 1;
  };

  /** Admits canonical identifiers and a shared display bound before any HTTP request. */
  constructor(
    identifier: string,
    network: ViewerNetwork,
    historyLimit: number,
    signal?: AbortSignal,
    fetcher: FetchLike = fetch,
    provider: PlatformIdentityHistoryProvider = PLATFORM_IDENTITY_HISTORY_PROVIDER,
    fundingDecoder: ClassicIdentityFundingDecoder = decodeClassicIdentityFunding,
  ) {
    PlatformIdentifier.require(identifier);
    DashHistoryBudget.admit(historyLimit, "Identity history limit");
    this.#options = {
      identifier,
      network,
      historyLimit,
      signal,
      fetcher,
      provider,
      fundingDecoder,
    };
    this.#endpoint = provider.endpoint(network);
  }

  /** Returns provider history with explicit collection warnings; fails on malformed or conflicting pages. */
  async read(): Promise<PlatformIdentityHistorySnapshot> {
    if (this.#started) throw new PlatformIdentityHistoryError("identity.history.used");
    this.#started = true;
    const { identifier, network, historyLimit, signal, fetcher, provider } = this.#options;
    const endpoint = this.#endpoint;
    this.#request();
    const { indexedHeight, indexedTimeMs } = await platformExplorerTip(fetcher, network, signal);
    this.#request();
    const info = object(
      await fetchJson(fetcher, `${endpoint}/identity/${encodeURIComponent(identifier)}`, signal),
      "identity info",
    );
    if (info.identifier !== identifier)
      throw new PlatformIdentityHistoryError("identity.history.resource");
    const historyWarnings: string[] = [];
    const {
      transactions,
      transfers,
      documents,
      dataContracts,
      tokens,
      withdrawals,
      aliases,
      totalTransactions,
      totalTransfers,
      totalDocuments,
      totalDataContracts,
    } = await this.#collections(info, historyWarnings);
    const registration = await this.#registration(transactions, totalTransactions, info);
    return {
      provider: provider.displayName,
      identifier,
      owner: text(info.owner),
      explorerRevision: exactInteger(info.revision, "identity revision"),
      explorerBalanceCredits: exactInteger(info.balance, "identity balance"),
      explorerNonce: optionalExactInteger(info.nonce, "identity nonce"),
      ...registration,
      systemIdentity: info.isSystem === true,
      aliases,
      totalTransactions,
      totalTransfers,
      totalDocuments,
      totalDataContracts,
      totalGasSpentCredits: optionalExactInteger(info.totalGasSpent, "total gas spent"),
      averageGasSpentCredits: optionalExactInteger(info.averageGasSpent, "average gas spent"),
      totalTopUps: optionalInteger(info.totalTopUps),
      totalTopUpsCredits: optionalExactInteger(info.totalTopUpsAmount, "total top-up amount"),
      totalWithdrawals: optionalInteger(info.totalWithdrawals),
      totalWithdrawalsCredits: optionalExactInteger(
        info.totalWithdrawalsAmount,
        "total withdrawal amount",
      ),
      lastWithdrawalHash: text(info.lastWithdrawalHash),
      lastWithdrawalTimestampMs: timestamp(info.lastWithdrawalTimestamp),
      activity: mergeActivity(transactions, transfers, identifier),
      documents: documents.map(documentView),
      dataContracts: dataContracts.map(contractView),
      withdrawals: withdrawals.map(withdrawalView),
      tokens: tokens.map(tokenView),
      historyLimit,
      historyWarnings: historyWarnings.sort((left, right) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
      endpoint,
      indexStatus: "synced",
      indexedHeight,
      indexedTimeMs,
      requests: this.#requests,
    };
  }

  async #collections(info: Record<string, unknown>, historyWarnings: string[]) {
    const { identifier, historyLimit, signal, fetcher } = this.#options;
    const endpoint = this.#endpoint;
    const request = this.#request;
    const totalTransactions = requiredInteger(info.totalTxs, "identity transaction count");
    const totalTransfers = requiredInteger(info.totalTransfers, "identity transfer count");
    const totalDocuments = requiredInteger(info.totalDocuments, "identity document count");
    const totalDataContracts = requiredInteger(
      info.totalDataContracts,
      "identity data-contract count",
    );

    const paths = {
      transactions: `/identity/${encodeURIComponent(identifier)}/transactions`,
      transfers: `/identity/${encodeURIComponent(identifier)}/transfers`,
      documents: `/identity/${encodeURIComponent(identifier)}/documents`,
      dataContracts: `/identity/${encodeURIComponent(identifier)}/dataContracts`,
      tokens: `/identity/${encodeURIComponent(identifier)}/tokens`,
    };
    const [transactions, transfers, documents, dataContracts, tokens, withdrawalsValue] =
      await Promise.all([
        paginatedItems(
          fetcher,
          endpoint,
          paths.transactions,
          historyLimit,
          "identity transactions",
          signal,
          request,
          "transactions",
          totalTransactions,
          historyWarnings,
        ),
        paginatedItems(
          fetcher,
          endpoint,
          paths.transfers,
          historyLimit,
          "identity transfers",
          signal,
          request,
          "transfers",
          totalTransfers,
          historyWarnings,
        ),
        paginatedItems(
          fetcher,
          endpoint,
          paths.documents,
          historyLimit,
          "identity documents",
          signal,
          request,
          "resources",
          totalDocuments,
          historyWarnings,
        ),
        paginatedItems(
          fetcher,
          endpoint,
          paths.dataContracts,
          historyLimit,
          "identity data contracts",
          signal,
          request,
          "resources",
          totalDataContracts,
          historyWarnings,
        ),
        paginatedItems(
          fetcher,
          endpoint,
          paths.tokens,
          historyLimit,
          "identity tokens",
          signal,
          request,
          "resources",
          null,
          historyWarnings,
        ),
        (async (): Promise<unknown> => {
          request();
          return fetchJson(
            fetcher,
            `${endpoint}/identity/${encodeURIComponent(identifier)}/withdrawals?order=desc`,
            signal,
          ).catch((cause: unknown) => {
            if (cause instanceof ProviderHttpError && cause.status === 404) {
              return { resultSet: [], pagination: { page: null, limit: null, total: 0 } };
            }
            throw cause;
          });
        })(),
      ]);
    const withdrawals = page(withdrawalsValue, "identity withdrawals").items.slice(0, historyLimit);
    const aliases = Array.isArray(info.aliases) ? info.aliases.map(aliasView) : [];
    return {
      transactions,
      transfers,
      documents,
      dataContracts,
      tokens,
      withdrawals,
      aliases,
      totalTransactions,
      totalTransfers,
      totalDocuments,
      totalDataContracts,
    };
  }

  async #registration(
    transactions: Record<string, unknown>[],
    totalTransactions: number,
    info: Record<string, unknown>,
  ) {
    const { identifier, signal, fetcher, fundingDecoder } = this.#options;
    const endpoint = this.#endpoint;
    const paths = { transactions: `/identity/${encodeURIComponent(identifier)}/transactions` };
    const request = this.#request;
    let registration = creationTransaction(transactions);
    if (registration === null && totalTransactions > transactions.length) {
      request();
      const oldestTransactions = page(
        await fetchJson(
          fetcher,
          `${endpoint}${paths.transactions}?page=1&limit=1&order=asc`,
          signal,
        ),
        "identity registration transaction",
      ).items;
      registration = creationTransaction(oldestTransactions);
    }
    const registrationType = registration === null ? null : text(registration.type);
    const registrationTransactionHash =
      registration === null ? text(info.txHash) : text(registration.hash);
    if (registration !== null && registrationTransactionHash === null) {
      throw new PlatformIdentityHistoryError("identity.history.registration");
    }
    const registeredAtMs =
      registration === null ? timestamp(info.timestamp) : timestamp(registration.timestamp);
    let fundingCoreTransactionHash = text(info.fundingCoreTx);
    let fundingCoreTransactionOutputIndex: number | null = null;
    let fundingCoreTransactionError: string | null = null;
    if (registrationType === "IDENTITY_CREATE") {
      const encodedTransition = text(registration?.data);
      if (encodedTransition !== null) {
        try {
          const funding = fundingDecoder(encodedTransition);
          fundingCoreTransactionHash = funding.coreTransactionHash;
          fundingCoreTransactionOutputIndex = funding.outputIndex;
        } catch {
          fundingCoreTransactionError =
            "The indexed Identity creation transition could not be decoded by the pinned Dash Evo SDK.";
        }
      }
    } else if (
      registrationType === "IDENTITY_CREATE_FROM_ADDRESSES" ||
      registrationType === "IDENTITY_CREATE_FROM_SHIELDED_POOL"
    ) {
      fundingCoreTransactionHash = null;
    }

    return {
      registeredAtMs,
      registrationType,
      registrationTransactionHash,
      registrationFundingSource: registrationFundingSource(
        registrationType,
        fundingCoreTransactionHash,
      ),
      fundingCoreTransactionHash,
      fundingCoreTransactionOutputIndex,
      fundingCoreTransactionError,
    };
  }
}

/** Compatibility entry point for one canonical, bounded provider-history request. */
export async function queryPlatformIdentityHistory(
  identifier: string,
  network: ViewerNetwork,
  historyLimit: number,
  signal?: AbortSignal,
  fetcher: FetchLike = fetch,
  provider: PlatformIdentityHistoryProvider = PLATFORM_IDENTITY_HISTORY_PROVIDER,
  fundingDecoder: ClassicIdentityFundingDecoder = decodeClassicIdentityFunding,
): Promise<PlatformIdentityHistorySnapshot> {
  return new PlatformIdentityHistory(
    identifier,
    network,
    historyLimit,
    signal,
    fetcher,
    provider,
    fundingDecoder,
  ).read();
}
