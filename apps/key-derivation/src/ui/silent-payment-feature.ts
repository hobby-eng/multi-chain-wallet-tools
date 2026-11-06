import type { DerivationWorkerClient } from "../workers/derive-client.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";
import { AutomaticDerivationScheduler } from "./automatic-derivation.js";
import { RecoverySecretLifecycle } from "./recovery-secret-lifecycle.js";
import {
  SilentPaymentError,
  SilentPaymentParameters,
} from "@ckd/coins/bitcoin/silent-payment-parameters.js";
import type { SilentPaymentResult } from "@ckd/coins/bitcoin/silent-payments.js";
import { MAX_BIP32_INDEX } from "@ckd/core/bip32-limits.js";

interface SilentPaymentFeatureOptions {
  document: Document;
  /** Empty in the parent, bip85-wallet- in the child; both compose the same operation. */
  idPrefix?: string;
  mnemonic(): string;
  passphrase(): string;
  mnemonicToSeed: typeof import("@ckd/core/bip39.js").mnemonicToSeed;
  createWorker(): DerivationWorkerClient;
  isActive(): boolean;
  mnemonicMayBeComplete(): boolean;
  cryptoReady(): boolean;
}

const OUTPUT_IDS = [
  "silent-payment-address",
  "silent-payment-change-address",
  "silent-payment-scan-path",
  "silent-payment-scan-key",
  "silent-payment-spend-path",
  "silent-payment-spend-key",
] as const;
const REFRESH_DELAY_MS = 300;

/** The page's one catalogue for stable Silent Payments refusals, including worker transport. */
class SilentPaymentErrorText {
  static of(cause: unknown): string {
    const code = SilentPaymentError.codeOf(cause);
    const limits = SilentPaymentParameters.parameters();
    const messages: Record<NonNullable<typeof code>, string> = {
      "silent-payment.network": "Choose a supported Silent Payments network.",
      "silent-payment.account": `Silent Payment account must be an integer from 0 to ${MAX_BIP32_INDEX}.`,
      "silent-payment.labels": `Silent Payment labels must be integers from 1 to ${limits.maxLabelIndex}; label 0 is reserved for change.`,
      "silent-payment.label-count": `Request at most ${limits.maxLabels} labels at a time.`,
      "silent-payment.label-text": `Silent Payment label text must fit ${limits.maxLabelTextUnits} UTF-16 code units.`,
      "silent-payment.scalar": "BIP352 derived an unusable label scalar. Use another label.",
    };
    return code === undefined ? "Silent Payments derivation failed." : messages[code];
  }
}

/** Owns one panel's pending worker, seed lifetime, result revision and automatic refresh. */
export class SilentPaymentFeature implements Disposable {
  readonly #options: SilentPaymentFeatureOptions;
  readonly #refresh: AutomaticDerivationScheduler;
  readonly #button: HTMLButtonElement | null;
  readonly #network: HTMLSelectElement | null;
  readonly #account: HTMLInputElement | null;
  readonly #labels: HTMLInputElement | null;
  readonly #result: HTMLElement | null;
  readonly #error: HTMLElement | null;
  readonly #labeled: HTMLElement | null;
  #worker: DerivationWorkerClient | undefined;
  #seed: Uint8Array | undefined;
  #revision = 0;
  #disposed = false;

  constructor(options: SilentPaymentFeatureOptions) {
    this.#options = options;
    this.#refresh = new AutomaticDerivationScheduler(
      options.document.defaultView ?? window,
      REFRESH_DELAY_MS,
    );
    this.#button = this.#element("derive-silent-payment");
    this.#network = this.#element("silent-payment-network");
    this.#account = this.#element("silent-payment-account");
    this.#labels = this.#element("silent-payment-labels");
    this.#result = this.#element("silent-payment-result");
    this.#error = this.#element("silent-payment-error");
    this.#labeled = this.#element("silent-payment-labeled-list");
    if (this.#labels !== null)
      this.#labels.maxLength = SilentPaymentParameters.parameters().maxLabelTextUnits;
    if (this.#account !== null) this.#account.max = String(MAX_BIP32_INDEX);
    const limit = this.#element<HTMLElement>("silent-payment-label-limit");
    if (limit !== null) limit.textContent = String(SilentPaymentParameters.parameters().maxLabels);
    this.#button?.addEventListener("click", this.derive);
    this.#network?.addEventListener("change", this.scheduleRefresh);
    this.#account?.addEventListener("input", this.scheduleRefresh);
    this.#labels?.addEventListener("input", this.scheduleRefresh);
    options.document.querySelector("#clear-all")?.addEventListener("click", () => this.wipe());
    options.document.defaultView?.addEventListener("pagehide", () => this.wipe());
    if (this.#result !== null)
      RecoverySecretLifecycle.register(this.#result, () => this.setSecretsVisible(false));
  }

  #element<T extends Element>(id: string): T | null {
    return this.#options.document.querySelector<T>(`#${this.#options.idPrefix ?? ""}${id}`);
  }
  #failure(cause: unknown): void {
    if (this.#error === null) return;
    this.#error.textContent = SilentPaymentErrorText.of(cause);
    this.#error.hidden = false;
  }
  /** Admit every public parameter before deriving/copying a seed or constructing the worker. */
  derive = (): void => {
    if (
      this.#disposed ||
      this.#button === null ||
      this.#network === null ||
      this.#account === null ||
      this.#labels === null ||
      this.#result === null ||
      this.#error === null ||
      this.#labeled === null
    )
      return;
    try {
      this.clear();
      if (!this.#options.cryptoReady()) {
        this.#error.textContent = SELF_TEST_NOT_PASSED;
        this.#error.hidden = false;
        return;
      }
      const parameters = SilentPaymentParameters.fromFields(
        this.#network.value,
        this.#account.value,
        this.#labels.value,
      );
      this.#button.disabled = true;
      void this.#run(parameters, this.#revision);
    } catch (cause) {
      this.#failure(cause);
    }
  };

  async #run(parameters: SilentPaymentParameters, revision: number): Promise<void> {
    let seed: Uint8Array | undefined;
    let worker: DerivationWorkerClient | undefined;
    try {
      seed = this.#options.mnemonicToSeed(this.#options.mnemonic(), this.#options.passphrase());
      this.#seed = seed;
      worker = this.#options.createWorker();
      this.#worker = worker;
      const derived = await worker.deriveSilentPayment(
        seed,
        parameters.network,
        parameters.account,
        [...parameters.labels],
      );
      if (revision === this.#revision) this.#render(derived);
    } catch (cause) {
      if (revision === this.#revision) this.#failure(cause);
    } finally {
      seed?.fill(0);
      if (this.#seed === seed) this.#seed = undefined;
      if (this.#worker === worker) this.#worker = undefined;
      try {
        worker?.terminate();
      } catch {
        if (revision === this.#revision && this.#error !== null) {
          this.#error.textContent = "The Silent Payments worker could not be released normally.";
          this.#error.hidden = false;
        }
      } finally {
        if (revision === this.#revision && this.#button !== null)
          this.#button.disabled = !this.#options.cryptoReady();
      }
    }
  }
  #render(derived: SilentPaymentResult): void {
    const values: Record<(typeof OUTPUT_IDS)[number], string> = {
      "silent-payment-address": derived.address,
      "silent-payment-change-address": derived.changeAddress,
      "silent-payment-scan-path": derived.scanPath,
      "silent-payment-scan-key": derived.scanPublicKey,
      "silent-payment-spend-path": derived.spendPath,
      "silent-payment-spend-key": derived.spendPublicKey,
    };
    for (const id of OUTPUT_IDS) {
      const output = this.#element<HTMLElement>(id);
      if (output !== null) output.textContent = values[id];
    }
    this.#labeled?.replaceChildren(
      ...derived.labeledAddresses.map(({ label, address }) => {
        const row = this.#options.document.createElement("div");
        row.className = "row";
        const name = this.#options.document.createElement("span");
        name.className = "row-label";
        name.textContent = `Label ${label}`;
        const value = this.#options.document.createElement("code");
        value.className = "value";
        value.textContent = address;
        row.append(name, value);
        return row;
      }),
    );
    if (this.#result !== null) this.#result.hidden = false;
  }
  /** The owner can stop scheduled work without changing an already displayed result. */
  cancelScheduledRefresh = (): void => {
    this.#refresh.cancel();
  };
  /** Public field edits revoke old work before debouncing the replacement. */
  scheduleRefresh = (): void => {
    if (this.#disposed) return;
    this.clear();
    this.#refresh.schedule(
      () =>
        this.#options.isActive() &&
        this.#options.mnemonicMayBeComplete() &&
        this.#options.cryptoReady(),
      this.derive,
    );
  };
  /** Stops active work, wipes the owned seed and drops every displayed result. */
  clear = (): void => {
    this.#revision += 1;
    this.#seed?.fill(0);
    this.#seed = undefined;
    const worker = this.#worker;
    this.#worker = undefined;
    try {
      this.#refresh.cancel();
      worker?.terminate();
    } finally {
      if (this.#button !== null) this.#button.disabled = !this.#options.cryptoReady();
      if (this.#result !== null) this.#result.hidden = true;
      if (this.#error !== null) this.#error.hidden = true;
      this.#labeled?.replaceChildren();
      for (const id of OUTPUT_IDS) {
        const output = this.#element<HTMLElement>(id);
        if (output !== null) output.textContent = "";
      }
    }
  };
  /** Clear also releases the native label field and local disclosure state. */
  reset = (): void => {
    try {
      this.clear();
    } finally {
      if (this.#labels !== null) this.#labels.value = "";
      this.setSecretsVisible(false);
    }
  };
  /** Mirrors the host's disclosure controls; automatic concealment uses the same method. */
  setSecretsVisible = (revealed: boolean): void => {
    this.#result?.classList.toggle("revealed", revealed);
  };
  /** A failed self-test revokes work and closes this operation's native button. */
  setEnabled = (enabled: boolean): void => {
    try {
      if (!enabled) this.clear();
    } finally {
      if (this.#button !== null) this.#button.disabled = !enabled;
    }
  };
  /** Ends the panel's current result/operation lifetime; the panel can be used again. */
  wipe(): void {
    this.reset();
  }
  /** Permanently retires this panel owner. */
  [Symbol.dispose](): void {
    this.#disposed = true;
    this.wipe();
  }
}

/** Composition entry used by the parent and the BIP85 child; no operation state lives here. */
export function installSilentPaymentFeature(
  options: SilentPaymentFeatureOptions,
): SilentPaymentFeature {
  return new SilentPaymentFeature(options);
}
