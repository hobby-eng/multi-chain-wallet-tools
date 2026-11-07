import { WalletMatcherPlan } from "@ckd/recovery/matcher-plan.js";
import { installNumberedInput, updateLineNumbers } from "@ckd/ui/dom.js";
import { MnemonicEntries } from "@ckd/core/mnemonic-entries.js";
import { DerivationCancelledError } from "../workers/derive-client.js";
import { InputRevision } from "./recovery-input-revision.js";
import { RecoveryPanelRun } from "./recovery-panel-run.js";
import { MatcherResults } from "./matcher-results.js";
import {
  installSecretToggle,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";
import type { RecoveryFeature } from "./recovery-feature.js";

/** The thin Matcher host owns current inputs, workers and the result it has published. */
export class WalletMatcher {
  readonly #context: RecoveryFeatureContext;
  readonly #root: HTMLElement;
  readonly #status: HTMLElement;
  readonly #button: HTMLButtonElement;
  readonly #cancel: HTMLButtonElement;
  readonly #seeds: HTMLTextAreaElement;
  readonly #passphrases: HTMLTextAreaElement;
  readonly #inputs: InputRevision;
  readonly #run: RecoveryPanelRun;
  #result: MatcherResults | undefined;

  /** Installs input/output adapters; WalletMatcherPlan owns admission and all computations. */
  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    this.#root = required("#wallet-matcher-results");
    this.#status = required("#wallet-matcher-status");
    this.#button = required("#run-wallet-matcher");
    this.#cancel = required("#cancel-wallet-matcher");
    this.#seeds = required("#matcher-seeds");
    this.#passphrases = required("#matcher-passphrases");
    this.#installFields();
    this.#inputs = new InputRevision(required("#wallet-matcher-panel"), () => this.#revoke());
    this.#inputs.bindPageLifetime();
    document.addEventListener("recovery-source-change", (event) => {
      if (event instanceof CustomEvent && event.detail === "matcher") this.#inputs.revise();
    });
    this.#run = new RecoveryPanelRun(context, this.#inputs, this.#button, this.#root);
    this.#button.addEventListener("click", () => void this.#search());
    this.#cancel.addEventListener("click", () => {
      this.#inputs.revise();
      this.#status.textContent = "Search cancelled.";
    });
  }

  #installFields(): void {
    installSecretToggle(
      "#toggle-matcher-secrets",
      "#matcher-seeds, #matcher-passphrases",
      "Show lists",
      "Hide lists",
    );
    const coin = required<HTMLSelectElement>("#matcher-coin");
    for (const family of this.#context.registry.COIN_FAMILIES) {
      const option = coin.ownerDocument.createElement("option");
      option.value = family.id;
      option.textContent = family.label;
      coin.append(option);
    }
    const mainCoin = document.querySelector<HTMLSelectElement>("#coin")?.value;
    if (
      mainCoin !== undefined &&
      this.#context.registry.COIN_FAMILIES.some(({ id }) => id === mainCoin)
    )
      coin.value = mainCoin;
    const forceAll = required<HTMLInputElement>("#matcher-force-all");
    const change = required<HTMLInputElement>("#matcher-search-change");
    let preference = change.checked;
    change.addEventListener("change", () => {
      preference = change.checked;
    });
    const synchronize = (): void => {
      coin.disabled = forceAll.checked || this.#context.registry.COIN_FAMILIES.length < 2;
      change.checked = forceAll.checked || preference;
      change.disabled = forceAll.checked;
    };
    forceAll.addEventListener("change", synchronize);
    synchronize();
    const gutter = required<HTMLElement>("#matcher-seed-lines");
    installNumberedInput(this.#seeds, gutter);
    installNumberedInput(this.#passphrases, required<HTMLElement>("#matcher-passphrase-lines"));
    installNumberedInput(
      required<HTMLTextAreaElement>("#matcher-addresses"),
      required<HTMLElement>("#matcher-address-lines"),
    );
    const normalize = (): void => {
      try {
        const entries = MnemonicEntries.parse(this.#seeds.value);
        if (entries.length === 0) return;
        const normalized = entries.join("\n");
        if (normalized === this.#seeds.value) return;
        this.#seeds.value = normalized;
        updateLineNumbers(this.#seeds, gutter);
        this.#seeds.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (cause) {
        this.#inputs.revise();
        this.#status.textContent =
          cause instanceof Error ? cause.message : "Mnemonic list parsing failed.";
      }
    };
    this.#seeds.addEventListener("blur", normalize);
    this.#seeds.addEventListener("paste", () => window.setTimeout(normalize, 0));
  }

  #plan(): WalletMatcherPlan {
    const linked = this.#context.linkedValue("matcher");
    return new WalletMatcherPlan(
      {
        source:
          linked === null
            ? { kind: "lists", phrases: this.#seeds.value, passphrases: this.#passphrases.value }
            : { kind: "linked", ...linked },
        targets: required<HTMLTextAreaElement>("#matcher-addresses").value,
        network: required<HTMLSelectElement>("#matcher-network").value,
        coin: required<HTMLSelectElement>("#matcher-coin").value,
        allCoins: required<HTMLInputElement>("#matcher-force-all").checked,
        change: required<HTMLInputElement>("#matcher-search-change").checked,
        accountStart: Number(required<HTMLInputElement>("#matcher-account-start").value),
        accountEnd: Number(required<HTMLInputElement>("#matcher-account-end").value),
        indexStart: Number(required<HTMLInputElement>("#matcher-index-start").value),
        indexCount: Number(required<HTMLInputElement>("#matcher-index-count").value),
      },
      this.#context,
    );
  }

  #revoke(): void {
    this.#run.revoke(new DerivationCancelledError("Wallet matcher cancelled."));
    this.#result?.wipe();
    this.#result = undefined;
    this.#root.replaceChildren();
    this.#root.classList.remove("revealed");
    this.#status.textContent = "";
    this.#cancel.hidden = true;
  }

  async #search(): Promise<void> {
    const run = this.#run.begin();
    if (run === undefined) return;
    const { current } = run;
    this.#cancel.hidden = false;
    this.#status.textContent = "Validating recovery inputs…";
    try {
      using plan = this.#plan();
      if (!current()) return;
      const outcome = await plan.search(run.worker(), current, (completed, total) => {
        if (current())
          this.#status.textContent = `Scanning ${completed}/${total} wallet structures…`;
      });
      if (!current() || outcome.kind === "stopped") return;
      const findings = outcome.findings;
      if (findings.length === 0)
        this.#root.textContent =
          "No supplied address was found in the selected account and index ranges.";
      else
        this.#result = new MatcherResults(
          this.#context,
          this.#root,
          this.#status,
          findings,
          current,
          () => this.#plan(),
        );
      this.#status.textContent = `${findings.length} match${findings.length === 1 ? "" : "es"} found.`;
    } catch (cause) {
      if (current())
        this.#status.textContent = cause instanceof Error ? cause.message : "Wallet search failed.";
    } finally {
      this.#run.end(run);
      if (current()) this.#cancel.hidden = true;
    }
  }
}

/** Matcher composition only; all operation state is owned by WalletMatcher. */
export const recoveryFeature: RecoveryFeature = {
  phraseSlot: {
    target: "matcher",
    panelId: "wallet-matcher-panel",
    phraseField: "#matcher-seeds",
    passphraseField: "#matcher-passphrases",
    manualBlock: ".matcher-input-grid",
    linkedNote: "The matching BIP39 passphrase will be used when the search starts.",
  },
  install: (context) => {
    new WalletMatcher(context);
  },
};
