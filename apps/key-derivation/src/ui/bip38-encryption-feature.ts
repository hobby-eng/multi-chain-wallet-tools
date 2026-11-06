import { DerivationBranches } from "@ckd/coins/derivation-branches.js";
import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationResult } from "@ckd/core/types.js";
import { readControls, type DerivationControls } from "./inputs.js";
import type { ResultBranch } from "./result-branches.js";
import { DerivationCancelledError, type DerivationWorkerClient } from "../workers/derive-client.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";
import { PasswordControl } from "./password-control.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { defined } from "@ckd/core/defined.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { DerivationErrorText } from "./derivation-error-text.js";
const ENCRYPTION_FAILURE = "BIP38 encryption failed.";
const ERRORS = new ErrorCatalog("wallet.bip38-encryption", {
  branch: () => "The active address branch is no longer available.",
});

/** Native page edges supplied by the Deriver; derivation and encryption remain in the worker. */
export interface Bip38FeatureOptions {
  document: Document;
  controls: DerivationControls;
  adapter(): CoinAdapter;
  result(): DerivationResult | null;
  branch(): ResultBranch;
  mnemonic(): string;
  passphrase(): string;
  mnemonicToSeed: typeof import("@ckd/core/bip39.js").mnemonicToSeed;
  createWorker(): DerivationWorkerClient;
  render(): void;
  cryptoReady(): boolean;
}

/** Owns one batch, mutable ciphertext storage and native input/worker cancellation together. */
export class Bip38EncryptionFeature implements Disposable {
  readonly #options: Bip38FeatureOptions;
  readonly #supported: ReadonlySet<string>;
  readonly #panel: HTMLElement | null;
  readonly #enabled: HTMLInputElement | null;
  readonly #fields: HTMLElement | null;
  readonly #password: PasswordControl | undefined;
  readonly #status: HTMLElement | null;
  readonly #error: HTMLElement | null;
  readonly #encrypted = new Map<ResultBranch, Map<number, SecretValue<string>>>();
  readonly #visible = new Map<ResultBranch, number>();
  #revision = 0;
  #worker: DerivationWorkerClient | undefined;

  constructor(options: Bip38FeatureOptions, supported: ReadonlySet<string>) {
    this.#options = options;
    this.#supported = new Set(supported);
    this.#panel = options.document.querySelector("#bulk-bip38-panel");
    this.#enabled = options.document.querySelector("#enable-bulk-bip38");
    this.#fields = options.document.querySelector("#bulk-bip38-fields");
    this.#status = options.document.querySelector("#bulk-bip38-status");
    this.#error = options.document.querySelector("#bulk-bip38-error");
    const input = options.document.querySelector<HTMLInputElement>("#bulk-bip38-passphrase");
    const toggle = options.document.querySelector<HTMLButtonElement>(
      "#toggle-bulk-bip38-passphrase",
    );
    this.#password =
      input === null || toggle === null
        ? undefined
        : new PasswordControl(input, toggle, "BIP38 encryption passphrase");
    this.#enabled?.addEventListener("change", () => {
      if (this.#fields !== null) this.#fields.hidden = this.#enabled?.checked !== true;
      if (this.#enabled?.checked === true) {
        input?.focus();
        this.start();
      } else {
        try {
          this.invalidate();
        } finally {
          this.#password?.clear();
          options.render();
        }
      }
    });
    input?.addEventListener("input", () => {
      this.invalidate();
      options.render();
    });
    input?.addEventListener("change", () => this.start());
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.start();
      }
    });
    options.document.defaultView?.addEventListener("pagehide", () => this.wipe());
  }
  /** Decoded ciphertext views belong to the rendering/export operation, not the retained cache. */
  encryptedKeys(branch: ResultBranch): ReadonlyMap<number, string> {
    return new Map(
      [...(this.#encrypted.get(branch) ?? [])].map(([index, value]) => [index, value.value]),
    );
  }
  /** One transient ciphertext view, absent before successful encryption or after invalidation. */
  encryptedKey(branch: ResultBranch, index: number): string | undefined {
    return this.#encrypted.get(branch)?.get(index)?.value;
  }
  /** Completed row count for the captured branch, absent after invalidation. */
  visibleRows(branch: ResultBranch): number | undefined {
    return this.#visible.get(branch);
  }
  /** Whether the page enabled encryption and supplied a nonempty exact password. */
  isReady(): boolean {
    return this.#enabled?.checked === true && (this.#password?.value.length ?? 0) > 0;
  }
  /** Supported result IDs come from the edition's one composition policy. */
  supportsResult(resultId: string): boolean {
    return this.#supported.has(resultId);
  }
  /** Availability is presentation only; start independently checks support/readiness. */
  syncAvailability(available: boolean): void {
    if (this.#panel !== null) this.#panel.hidden = !available;
    if (!available && this.#enabled !== null) this.#enabled.checked = false;
    if (this.#fields !== null) this.#fields.hidden = !available || this.#enabled?.checked !== true;
    if (!available) this.cancel("BIP38 encryption is unavailable for the selected result.");
  }
  /** Stops pending publication and returns the controls to their editable state. */
  cancel(message: string): void {
    this.#revision += 1;
    const worker = this.#worker;
    this.#worker = undefined;
    try {
      worker?.terminate(new DerivationCancelledError(message));
    } finally {
      this.#unlock();
    }
  }
  /** Source/password changes revoke every ciphertext from the preceding request. */
  invalidate(): void {
    try {
      this.cancel("BIP38 encryption cancelled because results changed.");
    } finally {
      for (const branch of this.#encrypted.values())
        for (const value of branch.values()) value.wipe();
      this.#encrypted.clear();
      this.#visible.clear();
      if (this.#status !== null) this.#status.textContent = "";
      if (this.#error !== null) this.#error.hidden = true;
    }
  }
  /** Starts at most one batch; native failures settle inside its guarded asynchronous scope. */
  start(): void {
    void this.#run();
  }
  async #run(): Promise<void> {
    const result = this.#options.result();
    const password = this.#password;
    const status = this.#status;
    const error = this.#error;
    if (
      result === null ||
      password === undefined ||
      status === null ||
      error === null ||
      !this.isReady() ||
      password.input.disabled ||
      !this.supportsResult(result.id)
    )
      return;
    if (!this.#options.cryptoReady()) {
      error.textContent = SELF_TEST_NOT_PASSED;
      error.hidden = false;
      return;
    }
    this.invalidate();
    const revision = this.#revision;
    let seed: Uint8Array | undefined;
    let worker: DerivationWorkerClient | undefined;
    try {
      using encryptionPassword = SecretValue.utf16Texts([password.value]);
      const adapter = this.#options.adapter();
      const branch = this.#options.branch();
      const rows = result.rows.flatMap((row) => {
        const address = row.basic.find((field) => field.role === "paymentAddress")?.value;
        return address === undefined ? [] : [{ index: row.index, address }];
      });
      const encrypted = new Map<number, SecretValue<string>>();
      this.#encrypted.set(branch, encrypted);
      this.#visible.set(branch, 0);
      password.input.disabled = true;
      if (this.#enabled !== null) this.#enabled.disabled = true;
      this.#options.render();
      worker = this.#options.createWorker();
      this.#worker = worker;
      const { includeChange, includeCoinJoin, ...base } = readControls(
        adapter,
        this.#options.controls,
      );
      const plan = new DerivationBranches(
        adapter,
        base.branch,
        includeChange,
        includeCoinJoin,
      ).plans.find((candidate) => candidate.kind === branch);
      if (plan === undefined) throw ERRORS.create("branch", []);
      seed = this.#options.mnemonicToSeed(this.#options.mnemonic(), this.#options.passphrase());
      for (const [position, row] of rows.entries()) {
        if (revision !== this.#revision) return;
        status.textContent = `Encrypting ${position + 1} of ${rows.length}…`;
        const item = await worker.encryptBip38(
          plan.workerAdapterId ?? adapter.id,
          { ...base, branch: plan.branch, start: row.index, count: 1, seed },
          row.address,
          defined(encryptionPassword.value[0]),
        );
        if (revision !== this.#revision) return;
        encrypted.get(row.index)?.wipe();
        encrypted.set(row.index, SecretValue.text(item.encryptedKey));
        this.#visible.set(branch, position + 1);
        if (this.#options.branch() === branch && this.#options.result() === result)
          this.#options.render();
      }
      if (revision !== this.#revision) return;
      status.textContent = `Encrypted ${encrypted.size} generated private keys. Show sensitive values to view or copy them.`;
      if (this.#options.branch() === branch && this.#options.result() === result)
        this.#options.render();
    } catch (cause) {
      if (revision !== this.#revision) return;
      let fallback = ENCRYPTION_FAILURE;
      try {
        if (ERRORS.matches(cause, ["branch"])) fallback = ERRORS.create("branch", []).message;
      } catch {
        // A foreign error getter cannot replace the input-free operation failure.
      }
      error.textContent = DerivationErrorText.of(cause, fallback);
      error.hidden = false;
      status.textContent = "";
    } finally {
      seed?.fill(0);
      if (this.#worker === worker) this.#worker = undefined;
      try {
        worker?.terminate(new DerivationCancelledError("BIP38 worker released."));
      } finally {
        if (revision === this.#revision) this.#unlock();
      }
    }
  }
  #unlock(): void {
    if (this.#password !== undefined) this.#password.input.disabled = false;
    if (this.#enabled !== null) this.#enabled.disabled = false;
  }
  /** Clear drops pending work, retained ciphertext and typed password. */
  reset(): void {
    try {
      this.invalidate();
    } finally {
      this.#password?.clear();
      this.#password?.setVisible(false);
      if (this.#enabled !== null) this.#enabled.checked = false;
      if (this.#fields !== null) this.#fields.hidden = true;
    }
  }
  /** Ends every owned buffer and the field's reference. */
  wipe(): void {
    this.reset();
  }
  /** Ends this panel's operation lifetime. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Edition composition supplies support once; all operation state belongs to its class. */
export function createBip38EncryptionInstaller(resultIds: readonly string[]) {
  const supported = new Set(resultIds);
  return (options: Bip38FeatureOptions) => new Bip38EncryptionFeature(options, supported);
}
