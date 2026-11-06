import type { PlatformIdentityHistoryResult } from "./platform-identity-history-model.js";

const STATUS = {
  unavailable: "unavailable",
  unreported: "unreported",
  limited: "limited-or-unverified",
  noWarnings: "no-warnings-reported",
} as const;

/** Auxiliary coverage labels describe reported warnings; none certifies complete chain history. */
export type IdentityHistoryCoverageStatus = (typeof STATUS)[keyof typeof STATUS];

/** Keeps absent coverage and reported limitations separate from proof-verified Identity state. */
export class IdentityHistoryCoverage {
  readonly #available: boolean;
  readonly #warnings: readonly string[] | null;

  constructor(result: PlatformIdentityHistoryResult | undefined) {
    this.#available = result?.history !== null && result?.history !== undefined;
    this.#warnings =
      result?.history?.historyWarnings === undefined ? null : [...result.history.historyWarnings];
  }

  /** Returns a detached warning list, or null when no coverage information was supplied. */
  get warnings(): readonly string[] | null {
    return this.#warnings === null ? null : [...this.#warnings];
  }

  /** A warning-free response is labelled only as such, never as universally complete. */
  get status(): IdentityHistoryCoverageStatus {
    if (!this.#available) return STATUS.unavailable;
    if (this.#warnings === null) return STATUS.unreported;
    return this.#warnings.length > 0 ? STATUS.limited : STATUS.noWarnings;
  }

  /** Summarizes every expected Identity and retains each warning's resource association. */
  static summarize(
    identifiers: readonly string[],
    results: readonly PlatformIdentityHistoryResult[],
  ): {
    status: IdentityHistoryCoverageStatus;
    warnings: string;
  } {
    const coverage = identifiers.map((identifier) => ({
      identifier,
      value: new IdentityHistoryCoverage(
        results.find((result) => result.identifier === identifier),
      ),
    }));
    const priority = [STATUS.unavailable, STATUS.unreported, STATUS.limited, STATUS.noWarnings];
    const status =
      priority.find((state) => coverage.some(({ value }) => value.status === state)) ??
      STATUS.unavailable;
    return {
      status,
      warnings: coverage
        .flatMap(({ identifier, value }) =>
          (value.warnings ?? []).map((warning) => `${identifier}: ${warning}`),
        )
        .join("; "),
    };
  }
}
