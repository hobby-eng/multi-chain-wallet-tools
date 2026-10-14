import type {
  CoreAddressSnapshot,
  CoreAddressTransaction,
} from "@ckd/dash-network/public-address.js";

/** Presents provider accounting without inventing a confirmation-based balance split. */
export class CoreActivityState {
  readonly #snapshot: CoreAddressSnapshot;

  constructor(snapshot: CoreAddressSnapshot) {
    this.#snapshot = snapshot;
  }

  get balance() {
    return {
      reportedBalanceDuffs: this.#snapshot.balanceDuffs,
      // The provider adapter's legacy name holds an accounting discrepancy, not mempool funds.
      balanceDiscrepancyDuffs: this.#snapshot.unconfirmedDuffs,
      totalReceivedDuffs: this.#snapshot.totalReceivedDuffs,
      totalSentDuffs: this.#snapshot.totalSentDuffs,
    };
  }

  static confirmationStatus(
    transaction: Pick<CoreAddressTransaction, "confirmations" | "blockHeight">,
  ): "confirmed" | "unconfirmed" | "pending" {
    if (transaction.confirmations !== null) {
      return transaction.confirmations > 0 ? "confirmed" : "unconfirmed";
    }
    return transaction.blockHeight === null ? "pending" : "confirmed";
  }
}
