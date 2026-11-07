// Recover & Back Up: the addresses of a shared m-of-n wallet from its cosigners, each a recovery
// phrase with its passphrase or an account extended public key. The page turns phrases into seeds
// and the derivation worker builds the wallet (packages/coin-protocols/src/coins/multisig-wallet.ts);
// the result is shown with the Deriver's result cards. The build's address types come from the
// page's options, so this module names no coin.
import type { MultisigCosignerInput, MultisigWalletOptions } from "@ckd/coins/multisig-wallet.js";
import { clearDerivationResult } from "@ckd/core/secrets.js";
import { textLines } from "@ckd/core/text-lines.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { installNumberedInput } from "@ckd/ui/dom.js";
import { rowFields } from "@ckd/recovery/address-search.js";
import { DerivationCancelledError } from "../workers/derive-client.js";
import type { RecoveryFeature } from "./recovery-feature.js";
import { InputRevision } from "./recovery-input-revision.js";
import { RecoveryPanelRun } from "./recovery-panel-run.js";
import {
  installSecretToggle,
  integer,
  required,
  type RecoveryFeatureContext,
} from "./recovery-workspace-shared.js";
import { renderResults, updateSecretVisibility } from "./results.js";

/** An account extended public key, optionally with its [fingerprint/path] origin. */
const EXTENDED_KEY = /^(?:\[[0-9a-fA-F]{8}(?:\/[0-9]+['hH]?)*\])?[xt]pub[1-9A-HJ-NP-Za-km-z]+$/u;
const MAX_COSIGNERS = 20;
const MAX_ADDRESSES = 1000;
const MAX_INDEX = 0x7fff_ffff;
const RESULT_WINDOW = 20;

class MultisigWallet {
  readonly #context: RecoveryFeatureContext;
  readonly #status = required<HTMLElement>("#multisig-status");
  readonly #button = required<HTMLButtonElement>("#run-multisig");
  readonly #output = required<HTMLElement>("#multisig-output");
  readonly #summary = required<HTMLElement>("#multisig-summary");
  readonly #list = required<HTMLElement>("#multisig-results");
  readonly #notices = required<HTMLElement>("#multisig-notices");
  readonly #advanced = required<HTMLInputElement>("#multisig-advanced");
  readonly #reveal = required<HTMLButtonElement>("#toggle-multisig-private");
  readonly #scheme = required<HTMLSelectElement>("#multisig-scheme");
  readonly #path = required<HTMLSelectElement>("#multisig-path");
  readonly #inputs: InputRevision;
  readonly #run: RecoveryPanelRun;
  #result: DerivationResult | undefined;
  #windowStart = 0;
  #revealed = false;

  constructor(context: RecoveryFeatureContext) {
    this.#context = context;
    installSecretToggle(
      "#toggle-multisig-secrets",
      "#multisig-cosigners, #multisig-passphrases",
      "Show lists",
      "Hide lists",
    );
    installNumberedInput(
      required<HTMLTextAreaElement>("#multisig-cosigners"),
      required<HTMLElement>("#multisig-cosigner-lines"),
    );
    installNumberedInput(
      required<HTMLTextAreaElement>("#multisig-passphrases"),
      required<HTMLElement>("#multisig-passphrase-lines"),
    );
    this.#scheme.addEventListener("change", () => this.#offerPaths());
    this.#offerPaths();
    this.#inputs = new InputRevision(required("#multisig-panel"), () => this.#revoke());
    this.#inputs.bindPageLifetime();
    this.#run = new RecoveryPanelRun(context, this.#inputs, this.#button, this.#output);
    this.#button.addEventListener("click", () => void this.#build());
    this.#advanced.addEventListener("change", () => this.#render());
    this.#output.addEventListener("click", (event) => this.#copy(event));
    this.#reveal.addEventListener("click", () => {
      this.#revealed = !this.#revealed;
      this.#showReveal();
      updateSecretVisibility(this.#list, this.#revealed);
      updateSecretVisibility(this.#summary, this.#revealed);
    });
  }

  /** Whether the selected type needs every cosigner (MuSig2): no threshold or order to choose. */
  #allOfN(): boolean {
    return this.#scheme.selectedOptions[0]?.dataset.allOfN !== undefined;
  }

  /** Only the cosigner paths of the selected address type are offered. */
  #offerPaths(): void {
    const allOfN = this.#allOfN();
    required<HTMLInputElement>("#multisig-required").disabled = allOfN;
    required<HTMLSelectElement>("#multisig-order").disabled = allOfN;
    let first: HTMLOptionElement | undefined;
    for (const option of this.#path.options) {
      option.hidden = !(option.dataset.scheme ?? "").split(" ").includes(this.#scheme.value);
      option.disabled = option.hidden;
      if (!option.hidden) first ??= option;
    }
    if (this.#path.selectedOptions[0]?.hidden !== false && first !== undefined)
      this.#path.value = first.value;
  }

  #showReveal(): void {
    this.#reveal.textContent = this.#revealed ? "Hide private keys" : "Show private keys";
    this.#reveal.setAttribute("aria-pressed", String(this.#revealed));
  }

  /** Cosigner lines as phrases or keys, the seeds of the phrases, and the worker's options. */
  #request(): { seeds: Uint8Array[]; options: MultisigWalletOptions } {
    const lines = textLines(required<HTMLTextAreaElement>("#multisig-cosigners").value);
    const passphrases = textLines(required<HTMLTextAreaElement>("#multisig-passphrases").value);
    const entries = lines.map((line) => line.trim());
    while (entries.length > 0 && entries.at(-1) === "") entries.pop();
    if (entries.length < 2) throw new Error("Enter at least two cosigners, one per line.");
    if (entries.length > MAX_COSIGNERS)
      throw new Error(`Enter at most ${MAX_COSIGNERS} cosigners.`);
    if (passphrases.slice(entries.length).some((value) => value.length > 0))
      throw new Error("A passphrase line has no cosigner line.");
    const seeds: Uint8Array[] = [];
    try {
      const cosigners: MultisigCosignerInput[] = entries.map((entry, place) => {
        if (entry === "") throw new Error(`Cosigner line ${place + 1} is empty.`);
        if (EXTENDED_KEY.test(entry)) {
          if ((passphrases[place] ?? "") !== "")
            throw new Error(
              `Cosigner ${place + 1} is an extended public key: leave its passphrase empty.`,
            );
          return { key: entry };
        }
        try {
          seeds.push(this.#context.mnemonicToSeed(entry, passphrases[place] ?? ""));
        } catch {
          throw new Error(
            `Cosigner ${place + 1} is neither a valid BIP39 recovery phrase nor an account xpub.`,
          );
        }
        return { seed: seeds.length - 1 };
      });
      const network = required<HTMLSelectElement>("#multisig-network").value;
      if (network !== "mainnet" && network !== "testnet") throw new Error("Choose a network.");
      const order = required<HTMLSelectElement>("#multisig-order").value;
      if (order !== "sorted" && order !== "entered") throw new Error("Choose a key order.");
      const branch = Number(required<HTMLSelectElement>("#multisig-branch").value);
      if (branch !== 0 && branch !== 1) throw new Error("Choose receive or change addresses.");
      const start = integer(
        required<HTMLInputElement>("#multisig-start"),
        "Start index",
        0,
        MAX_INDEX,
      );
      const count = integer(
        required<HTMLInputElement>("#multisig-count"),
        "Number of addresses",
        1,
        MAX_ADDRESSES,
      );
      if (start + count - 1 > MAX_INDEX) throw new Error("The index range ends after 2^31 - 1.");
      return {
        seeds,
        options: {
          schemeId: this.#scheme.value,
          network,
          required: this.#allOfN()
            ? cosigners.length
            : integer(
                required<HTMLInputElement>("#multisig-required"),
                "Signatures required",
                1,
                cosigners.length,
              ),
          order,
          pathId: this.#path.value,
          account: integer(
            required<HTMLInputElement>("#multisig-account"),
            "Account",
            0,
            MAX_INDEX,
          ),
          branch,
          start,
          count,
          cosigners,
        },
      };
    } catch (cause) {
      for (const seed of seeds) seed.fill(0);
      throw cause;
    }
  }

  #revoke(): void {
    this.#run.revoke(new DerivationCancelledError("Multisig wallet cancelled."));
    if (this.#result !== undefined) clearDerivationResult(this.#result);
    this.#result = undefined;
    this.#summary.replaceChildren();
    this.#list.replaceChildren();
    this.#notices.replaceChildren();
    this.#output.hidden = true;
    this.#revealed = false;
    this.#showReveal();
    this.#status.textContent = "";
  }

  async #build(): Promise<void> {
    const run = this.#run.begin();
    if (run === undefined) return;
    const { current } = run;
    this.#status.textContent = "Building the multisig wallet…";
    let seeds: Uint8Array[] = [];
    try {
      const request = this.#request();
      seeds = request.seeds;
      const result = await run.worker().deriveMultisigWallet(seeds, request.options);
      if (!current()) {
        clearDerivationResult(result);
        return;
      }
      this.#result = result;
      this.#windowStart = 0;
      this.#output.hidden = false;
      this.#render();
      this.#status.textContent = `${result.title}: ${result.rows.length} address${result.rows.length === 1 ? "" : "es"}.`;
    } catch (cause) {
      if (current())
        this.#status.textContent =
          cause instanceof Error ? cause.message : "The multisig wallet could not be built.";
    } finally {
      for (const seed of seeds) seed.fill(0);
      this.#run.end(run);
    }
  }

  /** A result card's copy button copies its field; a private one only while revealed. */
  #copy(event: Event): void {
    if (!(event.target instanceof Element) || this.#result === undefined) return;
    const button = event.target.closest<HTMLButtonElement>("[data-copy-field]");
    if (button === null || button.disabled) return;
    const key = button.dataset.copyField;
    const fields =
      button.dataset.copyScope === "summary"
        ? [...this.#result.basicSummary, ...this.#result.summary]
        : (() => {
            const row = this.#result.rows.find(
              ({ index }) => String(index) === button.dataset.copyRow,
            );
            return row === undefined ? [] : rowFields(row);
          })();
    const field = fields.find((candidate) => candidate.key === key);
    if (field === undefined || (field.secret && !this.#revealed)) return;
    event.stopPropagation();
    void this.#context.writeClipboard(field.value).then(
      () => (this.#status.textContent = `Copied: ${field.label}.`),
      () => (this.#status.textContent = "Copying failed."),
    );
  }

  #render(): void {
    if (this.#result === undefined) return;
    renderResults(this.#summary, this.#list, this.#notices, this.#result, {
      mode: this.#advanced.checked ? "advanced" : "basic",
      selected: new Set<number>(),
      secretsRevealed: this.#revealed,
      windowStart: this.#windowStart,
      windowSize: RESULT_WINDOW,
      onWindowChange: (start) => {
        this.#windowStart = start;
        this.#render();
      },
      onSelectionChange: () => undefined,
      canSignMessages: false,
      onSignMessage: () => undefined,
      encryptedBip38: new Map(),
    });
  }
}

export const recoveryFeature: RecoveryFeature = {
  install: (context) => {
    new MultisigWallet(context);
  },
};
