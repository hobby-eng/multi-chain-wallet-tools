import { WalletMatcherPlan, type MatcherFinding } from "@ckd/recovery/matcher-plan.js";
import { MatcherSecrets } from "@ckd/recovery/matcher-secrets.js";
import { DerivationWorkerClient } from "../workers/derive-client.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import type { RecoveryFeatureContext } from "./recovery-workspace-shared.js";
import { defined } from "@ckd/core/defined.js";

const TSV = "text/tab-separated-values";

/** One result's public table, private worker and byte-owned optional private values. */
export class MatcherResults implements Disposable {
  readonly #context: Pick<RecoveryFeatureContext, "writeClipboard" | "downloadText">;
  readonly #root: HTMLElement;
  readonly #status: HTMLElement;
  readonly #findings: readonly MatcherFinding[];
  readonly #current: () => boolean;
  readonly #plan: () => WalletMatcherPlan;
  readonly #toolbar: HTMLElement;
  readonly #header: HTMLElement;
  readonly #rows: HTMLElement[] = [];
  readonly #privateCells: HTMLElement[] = [];
  readonly #reveal: HTMLButtonElement;
  #copy: HTMLButtonElement | undefined;
  #save: HTMLButtonElement | undefined;
  #values: MatcherSecrets | undefined;
  #worker: DerivationWorkerClient | undefined;
  #revision = 0;
  #alive = true;
  #visible = false;

  /** The parent permission covers inputs, readiness and page lifetime; plan reads synchronously. */
  constructor(
    context: Pick<RecoveryFeatureContext, "writeClipboard" | "downloadText">,
    root: HTMLElement,
    status: HTMLElement,
    findings: readonly MatcherFinding[],
    current: () => boolean,
    plan: () => WalletMatcherPlan,
  ) {
    this.#context = context;
    this.#root = root;
    this.#status = status;
    this.#findings = findings;
    this.#current = current;
    this.#plan = plan;
    const document = root.ownerDocument;
    this.#toolbar = document.createElement("div");
    this.#toolbar.className = "matcher-result-actions";
    this.#reveal = this.#button(
      "Show private keys",
      "danger-outline compact",
      () => void this.#show(),
    );
    const publicTsv = WalletMatcherPlan.publicTsv(findings);
    this.#toolbar.append(
      this.#button("Copy public matches", "secondary compact", () => {
        if (this.#permitted()) void context.writeClipboard(publicTsv);
      }),
      this.#button("Save public matches", "secondary compact", () => {
        if (this.#permitted())
          context.downloadText(publicTsv, "wallet-matcher-public-results.tsv", TSV);
      }),
      this.#reveal,
    );
    const tableWrap = document.createElement("div");
    tableWrap.className = "matcher-results-table-wrap";
    const table = document.createElement("table");
    table.className = "matcher-results-table";
    const head = document.createElement("thead");
    this.#header = document.createElement("tr");
    for (const label of MatcherSecrets.COLUMNS) {
      const cell = document.createElement("th");
      cell.textContent = label;
      this.#header.append(cell);
    }
    head.append(this.#header);
    table.append(head);
    const body = document.createElement("tbody");
    for (const finding of findings) {
      const row = document.createElement("tr");
      for (const text of [
        `#${finding.seedNumber}`,
        `#${finding.addressNumber} · ${finding.address}`,
        finding.adapter,
        finding.path,
      ]) {
        const cell = document.createElement("td");
        cell.textContent = text;
        row.append(cell);
      }
      this.#rows.push(row);
      body.append(row);
    }
    table.append(body);
    tableWrap.append(table);
    root.append(this.#toolbar, tableWrap);
    RecoverySecretLifecycle.register(this.#reveal, () => this.#conceal());
  }

  #button(text: string, className: string, action: () => void): HTMLButtonElement {
    const button = this.#root.ownerDocument.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
  }

  #permitted(): boolean {
    return this.#alive && this.#root.isConnected && this.#current();
  }

  async #show(): Promise<void> {
    if (!this.#permitted() || this.#worker !== undefined) return;
    if (this.#visible) {
      this.#conceal();
      return;
    }
    if (this.#values !== undefined) {
      this.#display();
      return;
    }
    const revision = ++this.#revision;
    const current = (): boolean => this.#permitted() && revision === this.#revision;
    this.#reveal.disabled = true;
    this.#reveal.textContent = "Deriving matched private keys…";
    let worker: DerivationWorkerClient | undefined;
    try {
      using plan = this.#plan();
      if (!current()) return;
      worker = new DerivationWorkerClient();
      this.#worker = worker;
      const values = await plan.privateValues(this.#findings, worker, current);
      if (values === undefined) return;
      if (!current()) {
        values.wipe();
        return;
      }
      this.#values = values;
      this.#display();
    } catch (cause) {
      if (current())
        this.#status.textContent =
          cause instanceof Error ? cause.message : "Matched private-key derivation failed.";
    } finally {
      worker?.terminate();
      if (this.#worker === worker) this.#worker = undefined;
      if (current()) {
        this.#reveal.disabled = false;
        this.#reveal.textContent = this.#visible ? "Hide private keys" : "Show private keys";
      }
    }
  }

  #display(): void {
    const values = this.#values;
    if (!this.#permitted() || values === undefined) return;
    this.#ensurePrivateActions();
    for (let index = 0; index < values.size; index += 1) {
      const cell = defined(this.#privateCells[index]);
      cell.replaceChildren();
      for (const field of values.fields(index)) {
        const line = this.#root.ownerDocument.createElement("div");
        const label = this.#root.ownerDocument.createElement("strong");
        label.textContent = field.label;
        const text = this.#root.ownerDocument.createElement("code");
        text.textContent = field.value;
        line.append(label, text);
        cell.append(line);
      }
    }
    this.#visible = true;
    this.#root.classList.add("revealed");
    this.#reveal.textContent = "Hide private keys";
    if (this.#copy !== undefined) this.#copy.disabled = false;
    if (this.#save !== undefined) this.#save.disabled = false;
  }

  #ensurePrivateActions(): void {
    if (this.#copy !== undefined) return;
    const header = this.#root.ownerDocument.createElement("th");
    header.textContent = "Matched private keys";
    this.#header.append(header);
    for (const row of this.#rows) {
      const cell = this.#root.ownerDocument.createElement("td");
      cell.className = "matcher-private-fields secret-value";
      row.append(cell);
      this.#privateCells.push(cell);
    }
    this.#copy = this.#button("Copy private matches", "secret-action compact", () => {
      if (this.#permitted() && this.#visible && this.#values !== undefined)
        void this.#context.writeClipboard(this.#values.tsv());
    });
    this.#save = this.#button("Save private matches", "secret-action compact", () => {
      if (this.#permitted() && this.#visible && this.#values !== undefined)
        this.#context.downloadText(this.#values.tsv(), "wallet-matcher-PRIVATE-results.tsv", TSV);
    });
    this.#toolbar.append(this.#copy, this.#save);
  }

  #conceal(): void {
    this.#revision += 1;
    this.#worker?.terminate();
    this.#worker = undefined;
    this.#visible = false;
    this.#root.classList.remove("revealed");
    for (const cell of this.#privateCells) cell.replaceChildren();
    if (this.#copy !== undefined) this.#copy.disabled = true;
    if (this.#save !== undefined) this.#save.disabled = true;
    this.#reveal.textContent = "Show private keys";
    this.#reveal.disabled = !this.#permitted();
  }

  /** Revokes callbacks, stops pending private work and wipes retained bytes before removing DOM. */
  wipe(): void {
    this.#alive = false;
    this.#conceal();
    this.#values?.wipe();
    this.#values = undefined;
    this.#root.replaceChildren();
  }
  /** Ends a replaced or invalidated result. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
