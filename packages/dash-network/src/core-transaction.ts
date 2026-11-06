import { PROVIDER_UNSIGNED_DECIMAL } from "@ckd/core/numeric-limits.js";
import { requireRecord } from "@ckd/core/records.js";
import { createProviderHttp } from "./provider-http.js";

/** Exact address flow in duffs; an unavailable whole-transaction fee remains null. */
export interface CoreAddressTransaction {
  txid: string;
  type: string | null;
  timestampMs: number | null;
  blockHeight: number | null;
  confirmations: number | null;
  instantLocked: boolean;
  chainLocked: boolean;
  receivedDuffs: bigint;
  spentInputDuffs: bigint;
  netDuffs: bigint;
  feeDuffs: bigint | null;
  blockHash: string | null;
}

const ERRORS = {
  "core.transaction.shape": "DashScan returned malformed transaction input or output data.",
  "core.transaction.amount": "DashScan returned an invalid or missing transaction amount.",
} as const;

/** Stable refusal codes for untrusted transaction shape and exact-duff amounts. */
export type CoreTransactionErrorCode = keyof typeof ERRORS;

/** Refuses incomplete address flow without echoing provider-controlled values. */
export class CoreTransactionError extends Error {
  constructor(readonly code: CoreTransactionErrorCode) {
    super(ERRORS[code]);
    this.name = "CoreTransactionError";
  }
}

interface FlowItem {
  readonly matches: boolean;
  readonly amount: bigint | null;
}

const { optionalInteger, exactInteger } = createProviderHttp("DashScan");

/** Admits a whole transaction before exposing any exact address flow. */
export class CoreTransaction {
  readonly #view: CoreAddressTransaction;

  /** Missing relevant amounts or malformed containers fail; absent unrelated amounts only hide the fee. */
  constructor(value: unknown, address: string) {
    const tx = CoreTransaction.#record(value);
    const inputs = CoreTransaction.#rows(tx.vIn).map((value) => {
      const input = CoreTransaction.#record(value);
      const inputAddress = CoreTransaction.#address(input.address);
      return { matches: inputAddress === address, amount: CoreTransaction.#amount(input.amount) };
    });
    const outputs = CoreTransaction.#rows(tx.vOut).map((value) => {
      const output = CoreTransaction.#record(value);
      return {
        matches: CoreTransaction.#addresses(output).includes(address),
        amount: CoreTransaction.#amount(output.value),
      };
    });
    const spentInputDuffs = CoreTransaction.#flow(inputs);
    const receivedDuffs = CoreTransaction.#flow(outputs);
    if (typeof tx.hash !== "string") throw new CoreTransactionError("core.transaction.shape");
    const time = typeof tx.timestamp === "string" ? Date.parse(tx.timestamp) : Number.NaN;
    this.#view = {
      txid: tx.hash,
      type: typeof tx.type === "string" ? tx.type : null,
      timestampMs: Number.isFinite(time) ? time : null,
      blockHeight: optionalInteger(tx.blockHeight),
      confirmations: optionalInteger(tx.confirmations),
      instantLocked: typeof tx.instantLock === "string" && tx.instantLock.length > 0,
      chainLocked: tx.chainLocked === true,
      receivedDuffs,
      spentInputDuffs,
      netDuffs: receivedDuffs - spentInputDuffs,
      feeDuffs: CoreTransaction.#fee(inputs, outputs),
      blockHash: typeof tx.blockHash === "string" ? tx.blockHash : null,
    };
  }

  /** Returns a detached public record; no partially parsed transaction can escape. */
  get view(): CoreAddressTransaction {
    return { ...this.#view };
  }

  static #record(value: unknown): Record<string, unknown> {
    try {
      return requireRecord(value, ERRORS["core.transaction.shape"]);
    } catch {
      throw new CoreTransactionError("core.transaction.shape");
    }
  }

  static #rows(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw new CoreTransactionError("core.transaction.shape");
    return value;
  }

  static #address(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") throw new CoreTransactionError("core.transaction.shape");
    return value;
  }

  static #addresses(output: Record<string, unknown>): string[] {
    const address = this.#address(output.address);
    if (output.addresses === undefined || output.addresses === null) {
      return address === null ? [] : [address];
    }
    const values = this.#rows(output.addresses);
    const addresses: string[] = [];
    for (const value of values) {
      if (typeof value !== "string") throw new CoreTransactionError("core.transaction.shape");
      addresses.push(value);
    }
    if (address !== null && !addresses.includes(address)) {
      throw new CoreTransactionError("core.transaction.shape");
    }
    return addresses;
  }

  static #amount(value: unknown): bigint | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && !PROVIDER_UNSIGNED_DECIMAL.test(value)) {
      throw new CoreTransactionError("core.transaction.amount");
    }
    try {
      const amount = exactInteger(value, "transaction amount");
      if (amount >= 0n) return amount;
    } catch {
      throw new CoreTransactionError("core.transaction.amount");
    }
    throw new CoreTransactionError("core.transaction.amount");
  }

  static #flow(items: readonly FlowItem[]): bigint {
    let total = 0n;
    for (const item of items) {
      if (!item.matches) continue;
      if (item.amount === null) throw new CoreTransactionError("core.transaction.amount");
      total += item.amount;
    }
    return total;
  }

  static #total(items: readonly FlowItem[]): bigint | null {
    let total = 0n;
    for (const item of items) {
      if (item.amount === null) return null;
      total += item.amount;
    }
    return total;
  }

  static #fee(inputs: readonly FlowItem[], outputs: readonly FlowItem[]): bigint | null {
    if (inputs.length === 0) return null;
    const inputTotal = this.#total(inputs);
    const outputTotal = this.#total(outputs);
    if (inputTotal === null || outputTotal === null) return null;
    const fee = inputTotal - outputTotal;
    return fee >= 0n ? fee : null;
  }
}
