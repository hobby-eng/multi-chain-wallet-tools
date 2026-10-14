import type { PlatformAddressSnapshot } from "./platform-address-source.js";
import type { PlatformAddressHistorySnapshot } from "./platform-address-history.js";

/** Compares indexed address accounting while retaining DAPI as the current-state authority. */
export class PlatformProofIndexReconciliation {
  readonly #agrees: boolean;

  constructor(
    proof: Pick<PlatformAddressSnapshot, "balanceCredits" | "nonce">,
    index: Pick<PlatformAddressHistorySnapshot, "explorerBalanceCredits" | "explorerNonce">,
  ) {
    // Heights can differ even when values agree; indexed history never replaces proof state.
    this.#agrees =
      proof.balanceCredits === index.explorerBalanceCredits &&
      proof.nonce === BigInt(index.explorerNonce);
  }

  get agrees(): boolean {
    return this.#agrees;
  }

  get status(): "proof_and_index_agree" | "proof_takes_precedence" {
    return this.#agrees ? "proof_and_index_agree" : "proof_takes_precedence";
  }
}
