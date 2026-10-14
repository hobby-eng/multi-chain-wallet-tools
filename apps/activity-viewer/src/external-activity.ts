import { AtomicAmount } from "@ckd/core/atomic-amount.js";
import { PublicExportSession } from "@ckd/export/public-export-session.js";
import { nonEmptyLines } from "@ckd/core/text-lines.js";
import { downloadBlob } from "@ckd/export/download.js";
import { createPublicActivityExport, type PublicActivityExport } from "./export-public.js";
import type { PublicDataNetwork, RecoveryHistory } from "@ckd/public-data-providers/types.js";
import {
  assertPublicBatchLookupInput,
  PrivateMaterialError,
} from "@ckd/secret-boundary/public-input-guard.js";
import { runPublicInputGuardSelfTest } from "@ckd/secret-boundary/public-input-guard-self-test.js";

export interface ExternalActivityHostView {
  canStartQuery(): boolean;
  isQueryRunning(): boolean;
  setExternalRunning(value: boolean): void;
}

export interface AddressResult {
  coin: string;
  address: string;
  balanceAtomic: bigint;
  nonce: bigint | null;
  blockHeight: bigint | null;
  history: RecoveryHistory;
}

export interface ExternalActivityAdapter {
  id: string;
  label: string;
  asset: string;
  decimals: number;
  singlePlaceholder: string;
  batchPlaceholder: string;
  normalize(value: string, network: PublicDataNetwork): string;
  dedupeKey(value: string): string;
  query(address: string, network: PublicDataNetwork, signal: AbortSignal): Promise<AddressResult>;
  /** The known answers of the address checks, at startup; throws when one differs. */
  selfTest(): readonly string[];
}

/**
 * Runs the known answers of what screens and reads the addresses once, before any lookup: the
 * public-input guard that refuses secret material typed as an address (it runs here too because a
 * build without Dash has no other startup check of it), then every adapter's address checks. The
 * names of the checks that passed, or the reason that keeps lookups closed.
 */
function adapterSelfTests(
  adapters: readonly ExternalActivityAdapter[],
): { readonly checks: readonly string[] } | { readonly failure: string } {
  try {
    return {
      checks: [
        ...runPublicInputGuardSelfTest(),
        ...adapters.flatMap((adapter) => adapter.selfTest()),
      ],
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { failure: `${reason} Lookups stay closed: do not use this copy of the tool.` };
  }
}

function required<T extends HTMLElement>(document: Document, selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null)
    throw new Error(`Required Multi-Chain viewer element is missing: ${selector}`);
  return element;
}

function formatAtomic(value: bigint | string | null, asset: string, decimals: number): string {
  if (value === null) return "Unavailable";
  const atomic = typeof value === "bigint" ? value : BigInt(value);
  return `${AtomicAmount.format(atomic, decimals, { negativeSign: "−", whole: (value) => value.toLocaleString() })} ${asset}`;
}

function formatDate(value: string | null): string {
  if (value === null) return "Unavailable";
  return (
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

function textElement(document: Document, className: string, text: string): HTMLElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = text;
  return element;
}

function stat(
  document: Document,
  label: string,
  value: string,
  icon: string,
  emphasis = false,
): HTMLElement {
  const card = document.createElement("div");
  card.className = emphasis ? "viewer-stat viewer-stat-balance" : "viewer-stat";
  card.append(
    textElement(document, "viewer-stat-icon", icon),
    textElement(document, "viewer-stat-label", label),
    textElement(document, "viewer-stat-value", value),
  );
  return card;
}

function resultCard(
  document: Document,
  result: AddressResult,
  metadata: ExternalActivityAdapter,
): HTMLElement {
  const { label, asset, decimals } = metadata;
  const card = document.createElement("article");
  card.className = "viewer-activity-card viewer-address-card direction-neutral";
  const head = document.createElement("div");
  head.className = "viewer-activity-head";
  const title = document.createElement("div");
  title.append(
    textElement(document, "viewer-direction", `${label} public address`),
    textElement(document, "viewer-position", result.address),
  );
  head.append(
    title,
    textElement(document, "viewer-amount", formatAtomic(result.balanceAtomic, asset, decimals)),
  );
  const details = document.createElement("dl");
  const rows: Array<readonly [string, string]> = [
    ["Current balance", formatAtomic(result.balanceAtomic, asset, decimals)],
    ["Total received", formatAtomic(result.history.totalReceivedAtomic, asset, decimals)],
    ["Total sent", formatAtomic(result.history.totalSentAtomic, asset, decimals)],
    ["Total fees", formatAtomic(result.history.totalFeesAtomic, asset, decimals)],
    ["Transactions", result.history.transactionCount?.toLocaleString() ?? "Unavailable"],
    [
      "Pending transactions",
      result.history.pendingTransactionCount?.toLocaleString() ?? "Unavailable",
    ],
    ["First seen", formatDate(result.history.firstSeen)],
    ["Last seen", formatDate(result.history.lastSeen)],
    ...(result.nonce === null ? [] : [["Account nonce", result.nonce.toLocaleString()] as const]),
    ...(result.blockHeight === null
      ? []
      : [["Account query block height", result.blockHeight.toLocaleString()] as const]),
    ["History source", result.history.source],
  ];
  for (const [name, value] of rows) {
    const term = document.createElement("dt");
    term.textContent = name;
    const definition = document.createElement("dd");
    definition.textContent = value;
    details.append(term, definition);
  }
  card.append(head, details);
  return card;
}

export function installExternalActivity(
  document: Document,
  view: ExternalActivityHostView,
  adapters: readonly ExternalActivityAdapter[],
): void {
  const adapterById = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const coin = required<HTMLSelectElement>(document, "#viewer-coin");
  const network = required<HTMLSelectElement>(document, "#viewer-network");
  const form = required<HTMLFormElement>(document, "#viewer-form");
  const single = required<HTMLInputElement>(document, "#full-viewing-key");
  const batch = required<HTMLTextAreaElement>(document, "#viewer-batch-input");
  const inputLabel = required<HTMLLabelElement>(document, "#viewer-input-label");
  const inputHelp = required<HTMLElement>(document, "#viewer-input-help");
  const scanLabel = required<HTMLElement>(document, "#scan-button-label");
  const cancelButton = required<HTMLButtonElement>(document, "#cancel-button");
  const clearButton = required<HTMLButtonElement>(document, "#clear-viewer");
  const status = required<HTMLElement>(document, "#viewer-status");
  const error = required<HTMLElement>(document, "#viewer-error");
  const results = required<HTMLElement>(document, "#viewer-results");
  const resultsHeading = required<HTMLElement>(document, "#viewer-results-heading");
  const resultsDescription = required<HTMLElement>(document, "#viewer-results-description");
  const summary = required<HTMLElement>(document, "#viewer-summary");
  const activity = required<HTMLElement>(document, "#viewer-activity");
  const completeness = required<HTMLElement>(document, "#viewer-completeness");
  const ledgerTitle = required<HTMLElement>(document, "#viewer-ledger-title");
  const ledgerOrder = required<HTMLElement>(document, "#viewer-ledger-order");
  const resultHelp = required<HTMLElement>(document, "#viewer-result-help");
  const exportActions = required<HTMLElement>(document, "#viewer-export-actions");
  const detectionTabs = required<HTMLElement>(document, ".viewer-detection-tabs");
  const advancedModes = required<HTMLElement>(document, "#viewer-advanced-modes");
  const capability = required<HTMLElement>(document, "#viewer-capability-controls");
  const privacyChip = required<HTMLElement>(document, "#viewer-privacy-chip");
  const diagnosticMode = required<HTMLElement>(document, "#diagnostic-mode");
  const diagnosticSource = required<HTMLElement>(document, "#diagnostic-source");
  const diagnosticRequests = required<HTMLElement>(document, "#diagnostic-requests");
  const diagnosticProof = required<HTMLElement>(document, "#diagnostic-proof");
  const diagnosticDetail = required<HTMLElement>(document, "#diagnostic-detail");
  const selfTest = adapterSelfTests(adapters);
  const selfTestLine = document.querySelector<HTMLElement>("#viewer-external-self-test");
  if (selfTestLine !== null) {
    selfTestLine.textContent =
      "failure" in selfTest
        ? selfTest.failure
        : `Address checks passed: ${selfTest.checks.join(" · ")}.`;
    selfTestLine.hidden = false;
  }
  let exportState: PublicActivityExport | null = null;
  let exporting = false;
  const exportSession = PublicExportSession.forHost(view);
  const exportButtons = (["csv", "xlsx", "json"] as const).map((format) => ({
    format,
    button: required<HTMLButtonElement>(document, `#viewer-export-${format}`),
  }));
  const setExportState = (state: PublicActivityExport | null): void => {
    exportState = state;
    exportSession.replace(state);
    exporting = false;
    exportActions.setAttribute("aria-busy", "false");
    exportActions.hidden = state === null;
    for (const { button } of exportButtons) button.disabled = state === null || exporting;
  };
  for (const { format, button } of exportButtons) {
    button.addEventListener(
      "click",
      (event) => {
        if (externalCoin() === null) return;
        event.stopImmediatePropagation();
        const state = exportState;
        if (state === null || exporting) return;
        const ticket = exportSession.begin(state);
        if (ticket === null) return;
        exporting = true;
        exportActions.setAttribute("aria-busy", "true");
        for (const { button } of exportButtons) button.disabled = true;
        void createPublicActivityExport(state, format)
          .then((file) => {
            if (exportState !== state || !exportSession.owns(ticket, state)) return;
            downloadBlob(file.blob, file.filename);
            status.textContent = `Exported ${file.filename}. Only loaded public data is included.`;
            status.hidden = false;
          })
          .catch((cause) => {
            // A failure of an export of results replaced meanwhile is not theirs (AUD-024-API004).
            if (exportState !== state || !exportSession.owns(ticket, state)) return;
            error.textContent = `Export failed: ${cause instanceof Error ? cause.message : String(cause)}`;
            error.hidden = false;
          })
          .finally(() => {
            if (!exportSession.finish(ticket, state)) return;
            exporting = false;
            exportActions.setAttribute("aria-busy", "false");
            for (const { button } of exportButtons) button.disabled = exportState === null;
          });
      },
      true,
    );
  }
  let active: { controller: AbortController; cleared: boolean } | null = null;

  const externalCoin = (): ExternalActivityAdapter | null => adapterById.get(coin.value) ?? null;
  const queryMode = (): "single" | "batch" =>
    document.querySelector('[data-query-mode="batch"].active') === null ? "single" : "batch";

  const configure = (): void => {
    if (view.isQueryRunning()) return;
    setExportState(null);
    const selected = externalCoin();
    if (selected === null) {
      detectionTabs.hidden = false;
      document.querySelector<HTMLButtonElement>('[data-detection-mode="auto"]')?.click();
      network.previousElementSibling!.textContent = "Dash network";
      (queryMode() === "batch" ? batch : single).dispatchEvent(new Event("input"));
      return;
    }
    const metadata = selected;
    detectionTabs.hidden = true;
    advancedModes.hidden = true;
    capability.hidden = true;
    network.previousElementSibling!.textContent = "Network";
    network.options[0]!.textContent = "Mainnet";
    network.options[1]!.textContent = "Testnet";
    const batchMode = queryMode() === "batch";
    inputLabel.textContent = `${metadata.label} public address`;
    single.placeholder = selected.singlePlaceholder;
    batch.placeholder = selected.batchPlaceholder;
    inputHelp.textContent = `Loads current ${metadata.asset} balance and confirmed lifetime address history. Only public addresses are sent to fixed network providers.`;
    scanLabel.textContent = batchMode
      ? `Load ${metadata.label} address batch`
      : `Load ${metadata.label} address activity`;
    privacyChip.lastChild!.textContent = " Public address lookup";
    diagnosticMode.textContent = `${selected.id} · ${network.value}`;
  };

  form.addEventListener(
    "submit",
    (event) => {
      const selected = externalCoin();
      if (selected === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (active !== null || !view.canStartQuery()) return;
      if ("failure" in selfTest) {
        error.textContent = selfTest.failure;
        error.hidden = false;
        return;
      }
      void (async () => {
        error.hidden = true;
        results.hidden = true;
        setExportState(null);
        const selectedNetwork = network.value as PublicDataNetwork;
        let values: string[];
        try {
          const input = queryMode() === "batch" ? batch.value : single.value;
          assertPublicBatchLookupInput(input);
          values = nonEmptyLines(input).map((value) => selected.normalize(value, selectedNetwork));
        } catch (cause) {
          if (cause instanceof PrivateMaterialError) {
            single.value = "";
            batch.value = "";
          }
          error.textContent =
            cause instanceof Error ? cause.message : "Invalid public address input.";
          error.hidden = false;
          status.hidden = true;
          return;
        }
        if (values.length === 0) {
          error.textContent = `Enter a ${selected.label} public address.`;
          error.hidden = false;
          return;
        }
        const operation = { controller: new AbortController(), cleared: false };
        active = operation;
        const signal = operation.controller.signal;
        view.setExternalRunning(true);
        status.textContent = `Loading ${values.length.toLocaleString()} ${selected.label} address${values.length === 1 ? "" : "es"}…`;
        status.hidden = false;
        diagnosticDetail.textContent =
          "Validating public addresses and loading current state plus confirmed lifetime history.";
        try {
          const loaded: AddressResult[] = [];
          // Ethereum identity is the 20-byte address, independent of display casing.
          const unique = [
            ...new Map(values.map((value) => [selected.dedupeKey(value), value])).values(),
          ];
          for (const value of unique) {
            if (signal.aborted) throw new DOMException("Query cancelled.", "AbortError");
            const result = await selected.query(value, selectedNetwork, signal);
            if (signal.aborted) throw new DOMException("Query cancelled.", "AbortError");
            loaded.push(result);
          }
          const metadata = selected;
          const balance = loaded.reduce((total, item) => total + item.balanceAtomic, 0n);
          const received = loaded.every(({ history }) => history.totalReceivedAtomic !== null)
            ? loaded.reduce((total, item) => total + BigInt(item.history.totalReceivedAtomic!), 0n)
            : null;
          const sent = loaded.every(({ history }) => history.totalSentAtomic !== null)
            ? loaded.reduce((total, item) => total + BigInt(item.history.totalSentAtomic!), 0n)
            : null;
          const transactions = loaded.every(({ history }) => history.transactionCount !== null)
            ? loaded.reduce((total, item) => total + item.history.transactionCount!, 0)
            : null;
          resultsHeading.textContent = `${metadata.label} address activity`;
          resultsDescription.textContent =
            loaded.length === 1
              ? loaded[0]!.address
              : `${loaded.length.toLocaleString()} public addresses`;
          summary.replaceChildren(
            stat(
              document,
              "Current balance",
              formatAtomic(balance, metadata.asset, metadata.decimals),
              "◎",
              true,
            ),
            stat(
              document,
              "Total received",
              formatAtomic(received, metadata.asset, metadata.decimals),
              "↓",
            ),
            stat(
              document,
              "Total sent",
              formatAtomic(sent, metadata.asset, metadata.decimals),
              "↑",
            ),
            stat(document, "Transactions", transactions?.toLocaleString() ?? "Unavailable", "≡"),
            stat(document, "Addresses", loaded.length.toLocaleString(), "◇"),
          );
          ledgerTitle.textContent = "Address history summaries";
          ledgerOrder.textContent = `${loaded.length.toLocaleString()} loaded`;
          resultHelp.textContent = loaded
            .map(({ history }) => history.note)
            .filter((value, index, all) => all.indexOf(value) === index)
            .join(" ");
          completeness.textContent = loaded.every(({ history }) => history.status === "complete")
            ? "Complete provider history was read for every address."
            : "At least one provider history reached its bounded pagination limit; unavailable lifetime dates or sums are not inferred.";
          activity.replaceChildren(...loaded.map((item) => resultCard(document, item, metadata)));
          diagnosticSource.textContent = [
            ...new Set(loaded.map(({ history }) => history.source)),
          ].join(" + ");
          diagnosticRequests.textContent = "Bounded provider requests";
          diagnosticProof.textContent =
            loaded[0]?.blockHeight === null
              ? "Confirmed history"
              : `Account query heights ${loaded
                  .map((item) => item.blockHeight!.toString())
                  .filter((height, index, all) => all.indexOf(height) === index)
                  .join(", ")}`;
          status.textContent = `${metadata.label} activity loaded for ${loaded.length.toLocaleString()} address${loaded.length === 1 ? "" : "es"}.`;
          setExportState({
            coin: selected.id,
            asset: selected.asset,
            decimals: selected.decimals,
            network: selectedNetwork,
            mode: queryMode(),
            results: loaded,
          });
          results.hidden = false;
        } catch (cause) {
          if (operation.cleared) return;
          if (signal.aborted) status.textContent = "Query cancelled.";
          else {
            error.textContent = cause instanceof Error ? cause.message : String(cause);
            error.hidden = false;
            status.hidden = true;
          }
        } finally {
          active = null;
          view.setExternalRunning(false);
        }
      })();
    },
    true,
  );

  cancelButton.addEventListener(
    "click",
    (event) => {
      if (active === null) return;
      event.stopImmediatePropagation();
      active.controller.abort();
    },
    true,
  );
  clearButton.addEventListener(
    "click",
    (event) => {
      // Route by the operation owner, even if script changes the disabled Coin control.
      if (active === null && (externalCoin() === null || view.isQueryRunning())) return;
      event.stopImmediatePropagation();
      if (active !== null) {
        active.cleared = true;
        active.controller.abort();
      }
      single.value = "";
      batch.value = "";
      setExportState(null);
      results.hidden = true;
      error.hidden = true;
      status.hidden = true;
    },
    true,
  );
  coin.addEventListener("change", () => {
    if (!view.isQueryRunning()) setExportState(null);
    queueMicrotask(configure);
  });
  network.addEventListener("change", () => queueMicrotask(configure));
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-query-mode]")) {
    button.addEventListener("click", () => queueMicrotask(configure));
  }
  queueMicrotask(configure);
}
