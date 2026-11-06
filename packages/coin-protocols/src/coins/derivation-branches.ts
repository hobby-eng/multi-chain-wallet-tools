import type { CoinAdapter } from "./registry-base.js";

/** Display identities of the receive/change and optional CoinJoin derivation branches. */
export type ResultBranch = "receive" | "change" | "coinjoin-external" | "coinjoin-internal";

/** A branch number and its worker adapter, when the selected protocol delegates that branch. */
export interface ResultBranchPlan {
  readonly kind: ResultBranch;
  readonly branch: number;
  readonly workerAdapterId?: string;
}

/** Owns the metadata-based branch plan shared by derivation, signing and private-key encryption. */
export class DerivationBranches {
  readonly #plans: readonly ResultBranchPlan[];

  /**
   * Snapshot the selected branch and optional change/CoinJoin branches. Protocols without an
   * address-branch pair preserve `selectedBranch`; branch numbers are derivation-path indexes.
   */
  constructor(
    adapter: Pick<CoinAdapter, "addressBranches" | "coinJoin">,
    selectedBranch: number,
    includeChange: boolean,
    includeCoinJoin = false,
  ) {
    const plans: ResultBranchPlan[] =
      includeChange && adapter.addressBranches !== undefined
        ? [
            { kind: "receive", branch: adapter.addressBranches.receive },
            { kind: "change", branch: adapter.addressBranches.change },
          ]
        : [{ kind: "receive", branch: selectedBranch }];
    if (includeCoinJoin && adapter.coinJoin !== undefined) {
      const { branches, workerAdapterId } = adapter.coinJoin;
      plans.push(
        { kind: "coinjoin-external", branch: branches.external, workerAdapterId },
        { kind: "coinjoin-internal", branch: branches.internal, workerAdapterId },
      );
    }
    this.#plans = Object.freeze(plans.map((plan) => Object.freeze(plan)));
  }

  /** Ordered, immutable captured branches; reading them needs no wallet secret. */
  get plans(): readonly ResultBranchPlan[] {
    return this.#plans;
  }

  /** Branches of the separate CoinJoin workspace, retaining the delegated worker adapter. */
  get coinJoin(): readonly ResultBranchPlan[] {
    return this.#plans.filter(
      ({ kind }) => kind === "coinjoin-external" || kind === "coinjoin-internal",
    );
  }
}
