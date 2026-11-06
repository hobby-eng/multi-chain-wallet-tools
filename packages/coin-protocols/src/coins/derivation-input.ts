import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";
import { IntegerInput } from "@ckd/core/validation.js";
import type { CoinAdapter } from "./registry-base.js";
import type { DerivationParameters } from "./derivation-request.js";

const MIN_RESULT_COUNT = 1;

/** Raw native control values; irrelevant profile fields are ignored before admission. */
export interface DerivationFields {
  readonly network: unknown;
  readonly account: unknown;
  readonly branch: unknown;
  readonly start: unknown;
  readonly count: unknown;
  readonly includeChange: boolean;
  readonly includeCoinJoin: boolean;
}

/** Public settings carried between compatible protocol profiles. */
export type SharedDerivationParameters = Pick<
  DerivationParameters,
  "network" | "account" | "start" | "count"
>;

/** A refused derivation setting, with no supplied field text in the error. */
export class DerivationInputError extends Error {
  readonly code: "derivation.input.network" | "derivation.input.range" | "derivation.input.branch";
  constructor(code: DerivationInputError["code"], maximum?: number) {
    const messages = {
      "derivation.input.network": "Choose a supported derivation network.",
      "derivation.input.range": `The requested index range exceeds ${maximum}.`,
      "derivation.input.branch": "Choose a supported derivation branch.",
    };
    super(messages[code]);
    this.name = "DerivationInputError";
    this.code = code;
  }
}

/** Owns profile-dependent admission, limits and remembered settings before any seed is derived. */
export class DerivationInput {
  /** Protocol index maxima, in integer account/address/branch indexes. */
  static limits(
    adapter: CoinAdapter,
  ): Readonly<{ account: number; start: number; branch: number; minimumCount: number }> {
    return Object.freeze({
      account: adapter.limits?.accountMax ?? MAX_BIP32_INDEX,
      start: adapter.limits?.startMax ?? MAX_BIP32_INDEX,
      branch: adapter.branchControl?.max ?? MAX_BIP32_INDEX,
      minimumCount: MIN_RESULT_COUNT,
    });
  }

  /** Admit one native form; branch, account and optional features follow the selected profile. */
  static fromFields(adapter: CoinAdapter, fields: DerivationFields): DerivationParameters {
    const limits = DerivationInput.limits(adapter);
    const branch =
      adapter.addressBranches?.receive ??
      (adapter.branchControl === undefined
        ? adapter.defaults.branch
        : IntegerInput.parse(fields.branch, adapter.branchControl.label, 0, limits.branch));
    if (
      adapter.addressBranches === undefined &&
      adapter.branchControl?.options !== undefined &&
      !adapter.branchControl.options.some((option) => option.value === branch)
    )
      throw new DerivationInputError("derivation.input.branch");
    const start = IntegerInput.parse(fields.start, "Start index", 0, limits.start);
    const count = IntegerInput.parse(
      fields.count,
      "Number of results",
      limits.minimumCount,
      limits.start + 1,
    );
    if (count - 1 > limits.start - start)
      throw new DerivationInputError("derivation.input.range", limits.start);
    const network = fields.network;
    if (network !== "mainnet" && network !== "testnet")
      throw new DerivationInputError("derivation.input.network");
    return {
      network,
      account:
        adapter.accountControl === false
          ? adapter.defaults.account
          : IntegerInput.parse(fields.account, "Account", 0, limits.account),
      branch,
      start,
      count,
      includeChange: adapter.addressBranches !== undefined && fields.includeChange,
      includeCoinJoin: adapter.coinJoin !== undefined && fields.includeCoinJoin,
    };
  }

  /** Preserve admitted shared settings while clamping to the target profile's index space. */
  static shared(
    adapter: CoinAdapter,
    base: DerivationParameters,
    shared: SharedDerivationParameters | undefined,
  ): DerivationParameters {
    const limits = DerivationInput.limits(adapter);
    const start = Math.min(shared?.start ?? base.start, limits.start);
    return {
      ...base,
      network: adapter.networkControl
        ? (shared?.network ?? base.network)
        : adapter.defaults.network,
      account:
        adapter.accountControl === false
          ? adapter.defaults.account
          : Math.min(shared?.account ?? base.account, limits.account),
      start,
      count: Math.min(shared?.count ?? base.count, limits.start - start + 1),
    };
  }
}
