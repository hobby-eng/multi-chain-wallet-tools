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
  /**
   * Where the network numbers its accounts apart from the address (Hedera's 0.0.N): the accounts the
   * address found with their balances, which `balanceAtomic` sums; absent on other coins.
   */
  accounts?: readonly { readonly id: string; readonly balance: bigint }[];
  history: RecoveryHistory;
}

export interface ExternalActivityAdapter {
  id: string;
  label: string;
  asset: string;
  decimals: number;
  /** The networks the coin offers; Testnet is disabled for a coin without one. */
  networks: readonly PublicDataNetwork[];
  /** Whether address history is read; without it only the balance (and nonce) are loaded. */
  readsHistory: boolean;
  /** The label of the account's nonce or sequence line, where the coin's accounts have one. */
  nonceLabel?: string;
  /** What a person enters, where it is not a public address (NEAR's public key). */
  inputName?: string;
  /** The sentence added to a refusal of private-looking input, saying what to enter instead. */
  privateMaterialHint?: string;
  singlePlaceholder: string;
  batchPlaceholder: string;
  normalize(value: string, network: PublicDataNetwork): string;
  dedupeKey(value: string): string;
  query(address: string, network: PublicDataNetwork, signal: AbortSignal): Promise<AddressResult>;
  /** The known answers of the address checks, at startup; throws when one differs. */
  selfTest(): readonly string[];
}

/** What a lookup of `adapter` reads besides any history: the balance, and its nonce or sequence. */
function stateRead(adapter: Pick<ExternalActivityAdapter, "nonceLabel">): string {
  return adapter.nonceLabel === undefined
    ? "balance"
    : `balance and ${adapter.nonceLabel.toLowerCase()}`;
}

/** What a person enters for `adapter`: a public address, unless the coin names another form. */
function inputName(adapter: Pick<ExternalActivityAdapter, "inputName">): string {
  return adapter.inputName ?? "public address";
}

/**
 * The lookups of `input` for `adapter`, screened first: the whole input is refused as private
 * material before any value is read as the coin's address (PrivateMaterialError), and every line
 * must be one of the coin's addresses. No request is made for a refused input.
 */
function readLookupInput(
  input: string,
  adapter: Pick<ExternalActivityAdapter, "normalize">,
  network: PublicDataNetwork,
): string[] {
  assertPublicBatchLookupInput(input);
  return nonEmptyLines(input).map((value) => adapter.normalize(value, network));
}

/**
 * The proof line of `loaded` lookups: the heights the account reads named; without any, confirmed
 * history where it was read, else the provider's current state, which claims no history.
 */
function lookupProof(
  adapter: Pick<ExternalActivityAdapter, "readsHistory">,
  loaded: readonly Pick<AddressResult, "blockHeight">[],
): string {
  const heights = [
    ...new Set(
      loaded.flatMap(({ blockHeight }) => (blockHeight === null ? [] : [blockHeight.toString()])),
    ),
  ];
  if (heights.length > 0) return `Account query heights ${heights.join(", ")}`;
  return adapter.readsHistory
    ? "Confirmed history"
    : "Current provider state; the provider reports no height";
}

/**
 * The current balance of `loaded` lookups: their sum, except that an account two lookups reached
 * (a Hedera account by its number and by its key, say) counts once, with its latest balance read.
 * How many distinct accounts more than one loaded lookup reached comes with it.
 */
function loadedBalance(loaded: readonly Pick<AddressResult, "balanceAtomic" | "accounts">[]): {
  balance: bigint;
  repeated: number;
} {
  const accounts = new Map<string, bigint>();
  const repeats = new Set<string>();
  let balance = 0n;
  for (const result of loaded) {
    if (result.accounts === undefined) {
      balance += result.balanceAtomic;
      continue;
    }
    for (const { id, balance: held } of result.accounts) {
      if (accounts.has(id)) repeats.add(id);
      accounts.set(id, held);
    }
  }
  for (const held of accounts.values()) balance += held;
  return { balance, repeated: repeats.size };
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
    // Coins that share their address checks (the EVM networks) name them once.
    return {
      checks: [
        ...new Set([
          ...runPublicInputGuardSelfTest(),
          ...adapters.flatMap((adapter) => adapter.selfTest()),
        ]),
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
    ...(result.accounts === undefined
      ? []
      : [
          [
            "Account IDs",
            result.accounts.length === 0
              ? "None on the network"
              : result.accounts.map(({ id }) => id).join(", "),
          ] as const,
        ]),
    ...(result.accounts === undefined || result.accounts.length < 2
      ? []
      : [
          [
            "Account balances",
            result.accounts
              .map(({ id, balance }) => `${id}: ${formatAtomic(balance, asset, decimals)}`)
              .join(", "),
          ] as const,
        ]),
    ...(result.nonce === null || metadata.nonceLabel === undefined
      ? []
      : [[metadata.nonceLabel, result.nonce.toLocaleString()] as const]),
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
    const networkLabel = network.previousElementSibling;
    const mainnet = network.options[0];
    const testnet = network.options[1];
    const privacyText = privacyChip.lastChild;
    if (
      networkLabel === null ||
      mainnet === undefined ||
      testnet === undefined ||
      privacyText === null
    )
      throw new Error(
        "The Viewer page lost the network label, its Mainnet or Testnet option, or the privacy chip text.",
      );
    if (selected === null) {
      testnet.disabled = false;
      detectionTabs.hidden = false;
      document.querySelector<HTMLButtonElement>('[data-detection-mode="auto"]')?.click();
      networkLabel.textContent = "Dash network";
      (queryMode() === "batch" ? batch : single).dispatchEvent(new Event("input"));
      return;
    }
    const metadata = selected;
    detectionTabs.hidden = true;
    advancedModes.hidden = true;
    capability.hidden = true;
    networkLabel.textContent = "Network";
    mainnet.textContent = "Mainnet";
    testnet.textContent = "Testnet";
    // Most EVM networks have no testnet here: Mainnet stays the only choice.
    testnet.disabled = !selected.networks.includes("testnet");
    if (testnet.disabled && network.value === "testnet") network.value = "mainnet";
    const batchMode = queryMode() === "batch";
    inputLabel.textContent = `${metadata.label} ${inputName(metadata)}`;
    single.placeholder = selected.singlePlaceholder;
    batch.placeholder = selected.batchPlaceholder;
    inputHelp.textContent = metadata.readsHistory
      ? `Loads current ${metadata.asset} balance and confirmed lifetime address history. Only public addresses are sent to fixed network providers.`
      : `Loads current ${metadata.asset} ${stateRead(metadata)}; ${metadata.label} address history is not read. Only public values are sent to fixed network providers.`;
    scanLabel.textContent = batchMode
      ? `Load ${metadata.label} address batch`
      : `Load ${metadata.label} address activity`;
    privacyText.textContent = " Public address lookup";
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
          values = readLookupInput(input, selected, selectedNetwork);
        } catch (cause) {
          const privateMaterial = cause instanceof PrivateMaterialError;
          if (privateMaterial) {
            single.value = "";
            batch.value = "";
          }
          const hint =
            privateMaterial && selected.privateMaterialHint !== undefined
              ? ` ${selected.privateMaterialHint}`
              : "";
          error.textContent = `${cause instanceof Error ? cause.message : "Invalid public address input."}${hint}`;
          error.hidden = false;
          status.hidden = true;
          return;
        }
        if (values.length === 0) {
          error.textContent = `Enter a ${selected.label} ${inputName(selected)}.`;
          error.hidden = false;
          return;
        }
        const operation = { controller: new AbortController(), cleared: false };
        active = operation;
        const signal = operation.controller.signal;
        view.setExternalRunning(true);
        status.textContent = `Loading ${values.length.toLocaleString()} ${selected.label} address${values.length === 1 ? "" : "es"}…`;
        status.hidden = false;
        diagnosticDetail.textContent = selected.readsHistory
          ? "Validating public addresses and loading current state plus confirmed lifetime history."
          : `Validating public values and loading current ${stateRead(selected)}; address history is not read.`;
        try {
          const loaded: AddressResult[] = [];
          // An EVM account is its 20-byte address, independent of display casing.
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
          const { balance, repeated } = loadedBalance(loaded);
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
          resultHelp.textContent = [
            ...loaded
              .map(({ history }) => history.note)
              .filter((value, index, all) => all.indexOf(value) === index),
            ...(repeated === 0
              ? []
              : [
                  `${repeated.toLocaleString()} account${repeated === 1 ? " was" : "s were"} reached by more than one lookup and ${repeated === 1 ? "counts" : "count"} once in the current balance.`,
                ]),
          ].join(" ");
          completeness.textContent = loaded.every(({ history }) => history.status === "complete")
            ? "Complete provider history was read for every address."
            : loaded.every(({ history }) => history.status === "unsupported")
              ? "Address history is not read for this network; received and sent totals and dates are unknown, not zero."
              : "At least one provider history reached its bounded pagination limit; unavailable lifetime dates or sums are not inferred.";
          activity.replaceChildren(...loaded.map((item) => resultCard(document, item, metadata)));
          diagnosticSource.textContent = [
            ...new Set(loaded.map(({ history }) => history.source)),
          ].join(" + ");
          diagnosticRequests.textContent = "Bounded provider requests";
          diagnosticProof.textContent = lookupProof(metadata, loaded);
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
