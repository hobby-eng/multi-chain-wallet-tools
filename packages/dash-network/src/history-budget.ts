/** Admission shared by every Dash public-history entry point and its UI controls. */
export class DashHistoryBudget {
  static readonly minimum = 1;
  static readonly maximum = 1_000;
  static readonly defaultLimit = 200;

  static admit(value: number, label = "Transaction history limit"): number {
    if (!Number.isSafeInteger(value) || value < this.minimum || value > this.maximum) {
      throw new Error(`${label} must be an integer from ${this.minimum} to ${this.maximum}.`);
    }
    return value;
  }
}
