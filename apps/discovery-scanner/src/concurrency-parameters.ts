/** Separate policies for provider requests and local wallet orchestration, even at equal limits. */
export class ScannerConcurrencyParameters {
  readonly #maximum: number;
  readonly #defaultValue: number;
  readonly #defaultLabel: string;
  readonly #maximumLabel: string;

  constructor(maximum: number, defaultValue: number, defaultLabel: string, maximumLabel = "") {
    this.#maximum = maximum;
    this.#defaultValue = defaultValue;
    this.#defaultLabel = defaultLabel;
    this.#maximumLabel = maximumLabel;
  }

  admit(value: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < 1 || value > this.#maximum) {
      throw new Error(`${label} must be an integer from 1 to ${this.#maximum}.`);
    }
    return value;
  }

  get defaultValue(): number {
    return this.#defaultValue;
  }

  parse(value: string, label: string): number {
    return this.admit(Number(value), label);
  }

  populate(select: HTMLSelectElement): void {
    select.replaceChildren(
      ...Array.from({ length: this.#maximum }, (_, index) => {
        const value = index + 1;
        const option = select.ownerDocument.createElement("option");
        option.value = String(value);
        const detail =
          value === this.#defaultValue
            ? this.#defaultLabel
            : value === this.#maximum
              ? this.#maximumLabel
              : "";
        option.textContent = `${value}${detail ? ` · ${detail}` : ""}`;
        option.selected = value === this.#defaultValue;
        return option;
      }),
    );
  }
}

export const SCANNER_NETWORK_CONCURRENCY = new ScannerConcurrencyParameters(
  5,
  5,
  "recommended maximum",
);
export const SCANNER_ORCHESTRATION_CONCURRENCY = new ScannerConcurrencyParameters(
  5,
  1,
  "recommended / predictable",
  "highest DAPI load",
);
