import { RecoveryNetworkGateway } from "./network-gateway.js";
import { SecretEgressGuard } from "@ckd/secret-boundary/secret-guard.js";
import type {
  RecoveryCoinAdapter,
  RecoveryFinding,
  RecoveryHistory,
  RecoveryScanContext,
  RecoverySectionId,
  RecoveryWalletResult,
} from "./types.js";

export { emptyHistory, validateHistory, historyAmount, historyFields } from "./history-model.js";
import { emptyHistory, validateHistory } from "./history-model.js";

export function historyGateway(context: RecoveryScanContext): RecoveryNetworkGateway {
  return new RecoveryNetworkGateway(
    context.sessionSecretGuard ?? new SecretEgressGuard(),
    context.networkApi,
    context.networkLimiter,
  );
}

const HISTORY_UNAVAILABLE =
  "The history provider is unavailable or returned inconsistent data. The discovered balance is preserved; retry the scan to refresh history.";
const HISTORY_CANCELLED =
  "History was not completed because the scan was cancelled. The discovered balance is preserved; its history is unknown.";
const REFUSALS = {
  used: "This history enrichment has already started.",
  units: "History units differ from the adapter balance units.",
} as const;

/** Whether the pass ended or was cancelled; each history.status states its provider coverage. */
export type RecoveryHistoryOutcome = "complete" | "cancelled";

/** Stable input-free refusals of an invalid enrichment operation or unit contract. */
export class RecoveryHistoryError extends Error {
  readonly code: `recovery.history.${keyof typeof REFUSALS}`;
  constructor(reason: keyof typeof REFUSALS) {
    super(REFUSALS[reason]);
    this.name = "RecoveryHistoryError";
    this.code = `recovery.history.${reason}`;
  }
}

/** Owns one enrichment pass, preserving admitted balances and completed history across cancellation. */
export class RecoveryHistoryEnrichment {
  readonly #adapter: RecoveryCoinAdapter;
  readonly #result: RecoveryWalletResult;
  readonly #context: RecoveryScanContext;
  readonly #cache = new Map<string, RecoveryHistory>();
  readonly #completed = new Set<RecoveryFinding>();
  #used = false;

  constructor(
    adapter: RecoveryCoinAdapter,
    result: RecoveryWalletResult,
    context: RecoveryScanContext,
  ) {
    this.#adapter = adapter;
    this.#result = result;
    this.#context = context;
  }

  #empty(finding: RecoveryFinding, section: RecoverySectionId): RecoveryHistory {
    const unit = this.#adapter.amountUnit?.(section);
    if (unit !== undefined) finding.balanceUnit = unit;
    return emptyHistory(unit?.asset, unit?.atomicUnit, unit?.decimals);
  }

  #cancelled(): RecoveryHistoryOutcome {
    for (const section of this.#result.sections)
      for (const finding of section.findings)
        if (!this.#completed.has(finding) && finding.history?.status !== "complete")
          finding.history = { ...this.#empty(finding, section.id), note: HISTORY_CANCELLED };
    this.#result.completedAt = new Date().toISOString();
    return "cancelled";
  }

  /** Makes no new lookup after cancellation; late replies supply no authoritative history. */
  async run(): Promise<RecoveryHistoryOutcome> {
    if (this.#used) throw new RecoveryHistoryError("used");
    this.#used = true;
    const { signal } = this.#context;
    if (signal.aborted) return this.#cancelled();
    const findings = this.#result.sections.flatMap((section) =>
      section.findings.map((finding) => ({ section, finding })),
    );
    for (const [index, { section, finding }] of findings.entries()) {
      if (signal.aborted) return this.#cancelled();
      this.#context.onProgress({
        inputId: this.#result.inputId,
        section: section.id,
        message: `Loading history ${index + 1}/${findings.length}`,
        completed: index,
        total: findings.length,
      });
      if (signal.aborted) return this.#cancelled();
      const unavailable = this.#empty(finding, section.id);
      const key = `${section.id}:${finding.title}`;
      let h = this.#cache.get(key);
      if (h === undefined) {
        try {
          h =
            this.#adapter.getHistory === undefined
              ? {
                  ...unavailable,
                  status: "unsupported",
                  note: "This adapter does not provide historical data.",
                }
              : validateHistory(
                  await this.#adapter.getHistory(
                    finding,
                    section.id,
                    this.#result.network,
                    this.#context,
                  ),
                );
          const unit = finding.balanceUnit;
          if (
            unit !== undefined &&
            (h.asset !== unit.asset ||
              h.atomicUnit !== unit.atomicUnit ||
              h.decimals !== unit.decimals)
          )
            throw new RecoveryHistoryError("units");
        } catch {
          if (signal.aborted) return this.#cancelled();
          h = { ...unavailable, note: HISTORY_UNAVAILABLE };
        }
        if (signal.aborted) return this.#cancelled();
        this.#cache.set(key, h);
      }
      finding.history = h;
      if (finding.balanceUnit === undefined && h.asset && h.atomicUnit)
        finding.balanceUnit = { asset: h.asset, atomicUnit: h.atomicUnit, decimals: h.decimals };
      this.#completed.add(finding);
    }
    this.#result.completedAt = new Date().toISOString();
    return "complete";
  }
}

/** Compatibility entry; cancellation returns "cancelled" and leaves all admitted balances intact. */
export function enrichRecoveryHistory(
  adapter: RecoveryCoinAdapter,
  result: RecoveryWalletResult,
  context: RecoveryScanContext,
): Promise<RecoveryHistoryOutcome> {
  return new RecoveryHistoryEnrichment(adapter, result, context).run();
}
