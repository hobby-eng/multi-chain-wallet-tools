import { MAX_BATCH_SIZE } from "@ckd/core/bip32-limits.js";
import { KIBIBYTE, MEBIBYTE } from "@ckd/core/byte-units.js";
import type { CoinAdapter, CoinDerivationInput } from "./registry-base.js";
import { DerivationBranches, type ResultBranchPlan } from "./derivation-branches.js";

/** Non-secret derivation settings, including the additional result branches selected by the host. */
export type DerivationParameters = Omit<CoinDerivationInput, "seed"> & {
  includeChange: boolean;
  includeCoinJoin: boolean;
};

/** Explicit confirmation starts at this many result rows across the selected branches. */
const LARGE_REQUEST_ROWS = 10_000;
/** Heuristic result memory per row, including immutable formatted keys, in KiB. */
const RESULT_MEMORY_KIB = { low: 4, high: 12 } as const;
const KIBIBYTES_PER_MEBIBYTE = MEBIBYTE / KIBIBYTE;

/** A snapshot of an already admitted range and its branch, batch and memory planning facts. */
export class DerivationRequest {
  readonly #branches: readonly ResultBranchPlan[];
  readonly #total: number;
  readonly #batches: number;
  readonly #identity: string;

  /** Capture public settings only; the caller admits numeric/path limits before construction. */
  constructor(
    adapter: Pick<CoinAdapter, "id" | "batchSize" | "addressBranches" | "coinJoin">,
    input: DerivationParameters,
    feature: string | null,
  ) {
    const coinJoin = feature === "coinjoin" && adapter.coinJoin !== undefined;
    const branches = new DerivationBranches(
      adapter,
      input.branch,
      coinJoin ? false : input.includeChange,
      coinJoin,
    );
    this.#branches = Object.freeze(coinJoin ? branches.coinJoin : branches.plans);
    this.#total = input.count * this.#branches.length;
    this.#batches =
      Math.ceil(input.count / (adapter.batchSize ?? MAX_BATCH_SIZE)) * this.#branches.length;
    this.#identity = [
      adapter.id,
      feature,
      input.network,
      input.account,
      input.branch,
      input.start,
      input.count,
      input.includeChange,
      input.includeCoinJoin,
    ].join(":");
  }

  /** Ordered worker-dispatch branches; ordinary requests do not add the separate CoinJoin workspace. */
  get branches(): readonly ResultBranchPlan[] {
    return this.#branches;
  }

  /** Total requested rows across every branch. */
  get total(): number {
    return this.#total;
  }

  /** Total bounded worker batches, including a final partial batch on each branch. */
  get batches(): number {
    return this.#batches;
  }

  /** Public request identity; edits to any admitted range/branch setting revoke its confirmation. */
  get identity(): string {
    return this.#identity;
  }

  /** Whether this range needs an explicit second manual start. */
  get needsConfirmation(): boolean {
    return this.#total >= LARGE_REQUEST_ROWS;
  }

  /** Heuristic low/high result memory estimates in MiB, rounded upward. */
  get memoryMiB(): readonly [number, number] {
    return [
      Math.ceil((this.#total * RESULT_MEMORY_KIB.low) / KIBIBYTES_PER_MEBIBYTE),
      Math.ceil((this.#total * RESULT_MEMORY_KIB.high) / KIBIBYTES_PER_MEBIBYTE),
    ];
  }
}

/** Ordinary admission outcomes; a skipped automatic range and a question are not failures. */
export type DerivationConsentOutcome = "ready" | "skipped" | "confirm";

/** Owns the second-start confirmation for one unchanged public derivation request. */
export class DerivationConsent {
  #pending: string | undefined;

  /** Revoke a previous confirmation when the host changes or clears its source. */
  clear(): void {
    this.#pending = undefined;
  }

  /** Admit small requests, pause large manual requests once, and refuse automatic large work. */
  consider(request: DerivationRequest, automatic: boolean): DerivationConsentOutcome {
    if (!request.needsConfirmation) {
      this.clear();
      return "ready";
    }
    if (automatic) {
      this.clear();
      return "skipped";
    }
    if (this.#pending === request.identity) {
      this.clear();
      return "ready";
    }
    this.#pending = request.identity;
    return "confirm";
  }
}
