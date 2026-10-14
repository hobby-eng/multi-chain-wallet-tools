// The parts every coin's wallet result is made of, so that each adapter states only what is its own.
import type { RecoveryMetric, RecoveryNetwork, RecoveryWalletResult } from "./types.js";

/** The overview line of the value a scan located. */
export function locatedValueMetric(
  balance: bigint,
  format: (amount: bigint) => string,
): RecoveryMetric {
  return {
    label: "Total located value",
    value: format(balance),
    tone: balance > 0n ? "positive" : "neutral",
  };
}

/** The overview line of the funded addresses, or of whatever else holds the funds. */
export function fundedMetric(count: number, label = "Funded addresses"): RecoveryMetric {
  return { label, value: String(count), tone: count > 0 ? "positive" : "neutral" };
}

/** The warning of a watch-only result: a balance is spendable only once a wallet confirms it. */
export function verifyFundsWarning(coinLabel: string): string {
  return `Independently verify every funded address in a standard ${coinLabel} wallet before treating a balance as spendable.`;
}

/** One wallet's scan, from its start: the result it ends with carries both times. */
export class WalletScan {
  readonly #input: { readonly id: string; readonly label: string };
  readonly #coin: { readonly id: string; readonly label: string };
  readonly #network: RecoveryNetwork;
  readonly #startedAt = new Date().toISOString();

  constructor(
    input: { readonly id: string; readonly label: string },
    coin: { readonly id: string; readonly label: string },
    network: RecoveryNetwork,
  ) {
    this.#input = input;
    this.#coin = coin;
    this.#network = network;
  }

  /** The result of the scan, completed now. */
  result(
    parts: Pick<RecoveryWalletResult, "overview" | "sections" | "warnings">,
  ): RecoveryWalletResult {
    return {
      inputId: this.#input.id,
      label: this.#input.label,
      coinId: this.#coin.id,
      coinLabel: this.#coin.label,
      network: this.#network,
      startedAt: this.#startedAt,
      completedAt: new Date().toISOString(),
      ...parts,
    };
  }
}

/** Whether a wallet's scan left a section failed or partial, so that its report is not complete. */
export function resultIncomplete(result: Pick<RecoveryWalletResult, "sections">): boolean {
  return result.sections.some(({ state }) => state === "failed" || state === "partial");
}
