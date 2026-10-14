export interface AtomicAmountPresentation {
  readonly signed?: boolean;
  readonly negativeSign?: string;
  readonly whole?: (value: bigint) => string;
}

/** Exact base-ten amounts: presentation never converts an integer to a floating-point number. */
export class AtomicAmount {
  // Recovery history admits at most 30 decimal places, including every supported native asset.
  static readonly maximumDecimals = 30;

  static admitDecimals(decimals: number): number {
    if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > this.maximumDecimals) {
      throw new Error(
        `Atomic amount decimals must be an integer from 0 to ${this.maximumDecimals}.`,
      );
    }
    return decimals;
  }

  static #scale(decimals: number): bigint {
    return 10n ** BigInt(this.admitDecimals(decimals));
  }

  static format(
    value: bigint,
    decimals: number,
    presentation: AtomicAmountPresentation = {},
  ): string {
    const scale = this.#scale(decimals);
    const negative = value < 0n;
    const magnitude = negative ? -value : value;
    const whole = magnitude / scale;
    const fraction =
      decimals === 0
        ? ""
        : (magnitude % scale).toString().padStart(decimals, "0").replace(/0+$/u, "");
    const sign = negative
      ? (presentation.negativeSign ?? "-")
      : presentation.signed && value > 0n
        ? "+"
        : "";
    return `${sign}${presentation.whole?.(whole) ?? whole.toString()}${fraction ? `.${fraction}` : ""}`;
  }

  static parseDecimal(text: string, decimals: number): bigint | null {
    const scale = this.#scale(decimals);
    const match = /^(-?)(\d+)(?:\.(\d*))?$/u.exec(text);
    if (match === null || (match[3]?.length ?? 0) > decimals) return null;
    const magnitude =
      BigInt(match[2]!) * scale + BigInt((match[3] ?? "").padEnd(decimals, "0") || "0");
    return match[1] === "-" ? -magnitude : magnitude;
  }
}
