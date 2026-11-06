import { DashHistoryBudget } from "./history-budget.js";
import { CoreTransaction, type CoreAddressTransaction } from "./core-transaction.js";
import { createProviderHttp, type FetchLike } from "./provider-http.js";
import { validateAddressHistoryPage } from "./provider-json.js";

const DASHSCAN_PAGE_SIZE = 100;
const ERRORS = {
  "core.history.pending": "Unconfirmed history changed during pagination.",
  "core.history.page": "Address history returned an invalid page.",
  "core.history.count":
    "Address history changed during pagination or disagrees with its confirmed transaction count.",
  "core.history.confirmation":
    "A pending transaction changed confirmation state during pagination.",
  "core.history.short":
    "Address history ended before the reported transaction count. Retry the query.",
} as const;

/** Stable refusals of inconsistent provider pagination. */
export type CoreHistoryErrorCode = keyof typeof ERRORS;

/** Carries a safe pagination refusal, never provider-controlled text. */
export class CoreHistoryError extends Error {
  constructor(readonly code: CoreHistoryErrorCode) {
    super(ERRORS[code]);
    this.name = "CoreHistoryError";
  }
}

const { object, requiredInteger, fetchJson } = createProviderHttp("DashScan");

/** Owns complete-page validation before applying an address history display limit. */
export class CoreAddressHistory {
  readonly #address: string;
  readonly #endpoint: string;
  readonly #historyLimit: number;
  readonly #signal: AbortSignal | undefined;
  readonly #fetcher: FetchLike;

  constructor(
    address: string,
    endpoint: string,
    historyLimit: number,
    signal: AbortSignal | undefined,
    fetcher: FetchLike,
  ) {
    this.#address = address;
    this.#endpoint = endpoint;
    this.#historyLimit = DashHistoryBudget.admit(historyLimit);
    this.#signal = signal;
    this.#fetcher = fetcher;
  }

  /** Fetches bounded history or fails; partial or malformed pages never become complete history. */
  async read(
    transactionCount: number,
  ): Promise<{ transactions: CoreAddressTransaction[]; requests: number }> {
    transactionCount = requiredInteger(transactionCount, "transaction count");
    let requests = 0;
    const transactions: CoreAddressTransaction[] = [];
    const pending: CoreAddressTransaction[] = [];
    const pendingIds = new Set<string>();
    let paginationPendingOffset: number | null = null;
    let target = Math.min(Math.max(transactionCount, 1), this.#historyLimit);
    // Page-number APIs calculate offsets from the requested limit. Keep it fixed.
    const limit = Math.min(DASHSCAN_PAGE_SIZE, this.#historyLimit);
    const seen = new Set<string>();
    for (let pageNumber = 1; transactions.length < target; pageNumber += 1) {
      requests += 1;
      const page = object(
        await fetchJson(
          this.#fetcher,
          `${this.#endpoint}/address/${encodeURIComponent(this.#address)}/transactions?page=${pageNumber}&limit=${limit}&order=desc`,
          this.#signal,
        ),
        "transaction page",
      );
      if (!Array.isArray(page.resultSet)) throw new CoreHistoryError("core.history.page");
      const pendingRows = page.resultSet.filter((item) => CoreAddressHistory.#isPending(item));
      if (pageNumber !== 1 && pendingRows.length > 0)
        throw new CoreHistoryError("core.history.pending");
      if (pageNumber === 1)
        validateAddressHistoryPage(
          pendingRows,
          pendingRows.length,
          pendingRows.length,
          DashHistoryBudget.maximum,
          pendingIds,
        );
      pending.push(...pendingRows.map((item) => new CoreTransaction(item, this.#address).view));
      const items: unknown = page.resultSet.filter((item) => !CoreAddressHistory.#isPending(item));
      const pagination = object(page.pagination, "transaction pagination");
      const pageTotal = requiredInteger(pagination.total, "transaction pagination total");
      if (paginationPendingOffset === null) {
        const possibleOffsets = [...new Set([0, pendingRows.length])].filter(
          (offset) => pageTotal - offset === transactionCount,
        );
        if (possibleOffsets.length !== 1) {
          throw new CoreHistoryError("core.history.count");
        }
        const offset = possibleOffsets[0];
        if (offset === undefined) throw new CoreHistoryError("core.history.count");
        paginationPendingOffset = offset;
      }
      validateAddressHistoryPage(
        items,
        pageTotal - paginationPendingOffset,
        transactionCount,
        limit,
        seen,
      );
      if (items.some((item) => pendingIds.has(String(item.hash).toLowerCase())))
        throw new CoreHistoryError("core.history.confirmation");
      const fullPage = items.map((item) => new CoreTransaction(item, this.#address).view);
      target = Math.min(transactionCount, this.#historyLimit);
      const remaining = target - transactions.length;
      const parsed = fullPage.slice(0, remaining);
      transactions.push(...parsed);
      if (items.length < limit && transactions.length < target) {
        throw new CoreHistoryError("core.history.short");
      }
    }
    return { transactions: [...pending, ...transactions].slice(0, this.#historyLimit), requests };
  }

  static #isPending(item: unknown): boolean {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return false;
    const tx = object(item, "pending transaction");
    return (
      tx.blockHeight === null &&
      tx.blockHash === null &&
      tx.timestamp === null &&
      (tx.confirmations === null || tx.confirmations === 0)
    );
  }
}
