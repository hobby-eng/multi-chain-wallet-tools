import { UiEventScope } from "@ckd/ui/ui-event-scope.js";
import { DerivationBranches } from "@ckd/coins/derivation-branches.js";
import { DerivationInput } from "@ckd/coins/derivation-input.js";
import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { MessageSignature } from "@ckd/core/message-signature.js";
import { SigningMessage, SigningMessageError } from "@ckd/core/signing-message.js";
import type { DerivationResult, NetworkName } from "@ckd/core/types.js";
import { readControls, type DerivationControls } from "./inputs.js";
import type { ResultBranch } from "./result-branches.js";
import { DerivationCancelledError, type DerivationWorkerClient } from "../workers/derive-client.js";
import type { MessageSigningFormat } from "../workers/protocol.js";
import type { MessageSigningPolicy } from "./message-signing-policy.js";
import { MessageSigningFormatField } from "./message-signing-format-field.js";
import {
  MessageSigningVerification,
  type MessageVerificationTarget,
} from "./message-signing-verification.js";
import { SELF_TEST_NOT_PASSED } from "./crypto-self-test-gate.js";
import { DerivationErrorText } from "./derivation-error-text.js";

interface WalletSource {
  adapter: CoinAdapter | null;
  controls: DerivationControls | null;
  mnemonic: string | null;
  passphrase: string;
}

type SigningWorker = Pick<DerivationWorkerClient, "signMessage" | "verifyMessage" | "terminate">;
/** Native page edges; the library and the disposable worker own signing rules and computation. */
export interface MessageSigningFeatureOptions {
  document: Document;
  mainSource(): WalletSource;
  bip85Source(): WalletSource;
  mnemonicToSeed: typeof import("@ckd/core/bip39.js").mnemonicToSeed;
  /** The client copies a borrowed seed before returning its response promise. */
  createWorker(): SigningWorker;
  copy(button: HTMLButtonElement, text: string): void;
  cryptoReady(): boolean;
}

interface SigningContext {
  readonly index: number;
  readonly address: string;
  /** The key of the row's field the person clicked, to which the worker binds the key. */
  readonly addressKey: string;
  /** The row's network when the dialog opened, which verification needs and nothing else. */
  readonly network: NetworkName;
  readonly source: "main" | "bip85";
  readonly resultId: string;
  readonly resultBranch: ResultBranch;
}

const REFUSALS = {
  UI_MISSING: "The message-signing controls are unavailable.",
  ADDRESS_GONE: "The selected address is no longer available for message signing.",
  WALLET_GONE: "The selected wallet is no longer available for message signing.",
  BRANCH_GONE: "The active address branch is no longer available.",
  INVALID_FORMAT: "Select an offered message-signing format for this address.",
  SELF_TEST: SELF_TEST_NOT_PASSED,
  VERIFICATION_FAILED: "Generated signature failed local verification.",
} as const;
const SIGN_LABEL = "Sign message";
const SIGNING_LABEL = "Signing…";
const FAILED = "Message signing failed.";

class MessageSigningUiError extends Error {
  readonly code: keyof typeof REFUSALS;
  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "MessageSigningUiError";
    this.code = code;
  }
}

/** The text of a refusal raised by the dialog itself, which names no input; else undefined. */
function pageRefusalText(cause: unknown): string | undefined {
  return cause instanceof SigningMessageError || cause instanceof MessageSigningUiError
    ? cause.message
    : undefined;
}

/** Owns one dialog's request revision, native fields and disposable signing worker. */
export class MessageSigningFeature implements Disposable {
  readonly #options: MessageSigningFeatureOptions;
  readonly #policy: MessageSigningPolicy;
  readonly #events = new UiEventScope((cause) => this.#failure(cause));
  readonly #ui;
  readonly #format: MessageSigningFormatField;
  readonly #verification: MessageSigningVerification;
  #context: SigningContext | undefined;
  #worker: SigningWorker | undefined;
  #revision = 0;
  #disposed = false;

  constructor(options: MessageSigningFeatureOptions, policy: MessageSigningPolicy) {
    this.#options = options;
    this.#policy = policy;
    this.#ui = {
      dialog: this.#required<HTMLDialogElement>("#message-signer-dialog"),
      address: this.#required<HTMLElement>("#message-signer-address"),
      path: this.#required<HTMLElement>("#message-signer-path"),
      message: this.#required<HTMLTextAreaElement>("#message-signer-message"),
      messageHelp: options.document.querySelector<HTMLElement>("#message-signer-message-help"),
      sign: this.#required<HTMLButtonElement>("#sign-message-button"),
      close: this.#required<HTMLButtonElement>("#close-message-signer"),
      error: this.#required<HTMLElement>("#message-signer-error"),
      result: this.#required<HTMLElement>("#message-signature-result"),
      signature: this.#required<HTMLTextAreaElement>("#message-signature-output"),
      verification: this.#required<HTMLElement>("#message-signature-verification"),
      copy: this.#required<HTMLButtonElement>("#copy-message-signature"),
    };
    this.#format = new MessageSigningFormatField(
      options.document,
      policy,
      this.#required<HTMLElement>("#message-signer-format"),
    );
    this.#verification = new MessageSigningVerification({
      document: options.document,
      createWorker: () => options.createWorker(),
      target: () => this.#verificationTarget(),
      refusalText: pageRefusalText,
    });
    if (this.#ui.messageHelp !== null) this.#ui.messageHelp.textContent = SigningMessage.help;
    this.#events.listen(this.#ui.close, "click", this.close);
    this.#events.listen(this.#ui.dialog, "cancel", this.close);
    this.#events.listen(this.#ui.message, "input", () => this.#edited());
    const select = this.#format.select;
    if (select !== null)
      this.#events.listen(select, "change", () => {
        this.#edited();
        this.#format.refresh();
      });
    this.#events.listen(this.#ui.sign, "click", () => {
      void this.#sign();
    });
    this.#events.listen(this.#ui.copy, "click", () => {
      if (this.#ui.signature.value !== "") options.copy(this.#ui.copy, this.#ui.signature.value);
    });
    if (options.document.defaultView !== null)
      this.#events.listen(options.document.defaultView, "pagehide", this.close);
  }

  #required<T extends HTMLElement>(selector: string): T {
    const element = this.#options.document.querySelector<T>(selector);
    if (element === null) throw new MessageSigningUiError("UI_MISSING");
    return element;
  }

  /** The formats the coin policy offers for one address field; none means no signing action. */
  readonly offers = (resultId: string, addressKey: string): readonly MessageSigningFormat[] =>
    this.#policy.offer(resultId, addressKey);

  /** Captures only public row identity; current factors are read just before the request. */
  readonly open = (
    result: DerivationResult,
    branch: ResultBranch,
    source: "main" | "bip85",
    index: number,
    address: string,
    addressKey: string,
  ): void => {
    if (this.#disposed) return;
    const offered = this.offers(result.id, addressKey);
    const row = result.rows.find((candidate) => candidate.index === index);
    const controls = this.#source(source).controls;
    if (row === undefined || offered.length === 0 || controls === null) return;
    const network = DerivationInput.network(controls.network.value);
    this.invalidate();
    this.#context = {
      index,
      address,
      addressKey,
      network,
      source,
      resultId: result.id,
      resultBranch: branch,
    };
    this.#format.show(offered);
    this.#ui.address.textContent = address;
    this.#ui.path.textContent = row.path;
    this.#ui.message.value = "";
    this.#verification.clear();
    this.#resetOutput();
    this.#ui.dialog.showModal();
    this.#ui.message.focus();
  };

  /** Revokes a pending request and its displayed output, even if native termination fails. */
  readonly invalidate = (): void => {
    try {
      this.#cancel();
    } finally {
      this.#context = undefined;
      this.#resetOutput();
    }
  };

  /** Releases the request and clears native text on Close, cancellation and page exit. */
  readonly close = (): void => {
    try {
      this.invalidate();
    } finally {
      this.#ui.message.value = "";
      this.#ui.address.textContent = this.#ui.path.textContent = "";
      this.#format.clear();
      try {
        this.#verification.clear();
      } finally {
        if (this.#ui.dialog.open) this.#ui.dialog.close();
      }
    }
  };

  /** Whether the native dialog is currently visible. */
  readonly isOpen = (): boolean => this.#ui.dialog.open;
  /** Public source identity only, used by the main and child wallet's Clear operation. */
  readonly activeSource = (): "main" | "bip85" | null => this.#context?.source ?? null;

  #cancel(): void {
    this.#revision += 1;
    const worker = this.#worker;
    this.#worker = undefined;
    worker?.terminate(new DerivationCancelledError("Message-signing request superseded."));
  }

  #edited(): void {
    try {
      this.#cancel();
    } finally {
      try {
        this.#verification.reset();
      } finally {
        this.#resetOutput();
      }
    }
  }

  #resetOutput(): void {
    this.#ui.signature.value = "";
    this.#ui.result.hidden = true;
    this.#ui.verification.textContent = "";
    this.#ui.error.textContent = "";
    this.#ui.error.hidden = true;
    this.#ui.sign.disabled = false;
    this.#ui.sign.textContent = SIGN_LABEL;
  }

  #selection(): MessageSigningFormat {
    const admitted = this.#format.selected();
    if (admitted === null) throw new MessageSigningUiError("INVALID_FORMAT");
    return admitted;
  }

  /** The wallet of the dialog's row, which signing reads just before use. */
  #source(source: SigningContext["source"]): WalletSource {
    return source === "bip85" ? this.#options.bip85Source() : this.#options.mainSource();
  }

  /** The public request of a pasted signature: the row's address, its network and the format. */
  #verificationTarget(): MessageVerificationTarget {
    const context = this.#context;
    if (context === undefined) throw new MessageSigningUiError("ADDRESS_GONE");
    if (!this.#options.cryptoReady()) throw new MessageSigningUiError("SELF_TEST");
    const message = this.#ui.message.value;
    SigningMessage.require(message, true);
    const format = this.#selection();
    const compactAlternative = this.#format.compactAlternative();
    return {
      adapterId: context.resultId,
      request: { format, address: context.address, message, network: context.network },
      label: this.#format.label(),
      ...(compactAlternative === undefined ? {} : { compactAlternative }),
    };
  }

  #failure(cause: unknown): void {
    this.#ui.signature.value = "";
    this.#ui.result.hidden = true;
    this.#ui.error.textContent = pageRefusalText(cause) ?? DerivationErrorText.of(cause, FAILED);
    this.#ui.error.hidden = false;
  }

  async #sign(): Promise<void> {
    if (this.#disposed) return;
    const active = this.#context;
    let format: MessageSigningFormat;
    try {
      if (active === undefined) throw new MessageSigningUiError("ADDRESS_GONE");
      if (!this.#options.cryptoReady()) throw new MessageSigningUiError("SELF_TEST");
      SigningMessage.require(this.#ui.message.value);
      format = this.#selection();
      this.#cancel();
    } catch (cause) {
      this.#failure(cause);
      return;
    }
    const revision = this.#revision;
    let worker: SigningWorker | undefined;
    this.#ui.sign.disabled = true;
    this.#ui.sign.textContent = SIGNING_LABEL;
    try {
      worker = this.#options.createWorker();
      this.#worker = worker;
      let pending: Promise<MessageSignature>;
      {
        // Raw factors leave this synchronous scope before waiting for the worker response.
        const source = this.#source(active.source);
        if (source.adapter === null || source.controls === null || source.mnemonic === null)
          throw new MessageSigningUiError("WALLET_GONE");
        const { includeChange, includeCoinJoin, ...input } = readControls(
          source.adapter,
          source.controls,
        );
        const plan = new DerivationBranches(
          source.adapter,
          input.branch,
          includeChange,
          includeCoinJoin,
        ).plans.find((candidate) => candidate.kind === active.resultBranch);
        if (plan === undefined) throw new MessageSigningUiError("BRANCH_GONE");
        const seed = this.#options.mnemonicToSeed(source.mnemonic, source.passphrase);
        try {
          if (revision !== this.#revision || this.#context !== active) return;
          SigningMessage.require(this.#ui.message.value);
          pending = worker.signMessage(
            plan.workerAdapterId ?? source.adapter.id,
            { ...input, branch: plan.branch, start: active.index, count: 1, seed },
            active.address,
            active.addressKey,
            this.#ui.message.value,
            format,
          );
        } finally {
          seed.fill(0);
        }
      }
      const signed = await pending;
      if (revision !== this.#revision || this.#context !== active) return;
      if (!signed.verified) throw new MessageSigningUiError("VERIFICATION_FAILED");
      this.#ui.error.hidden = true;
      this.#ui.signature.value = signed.signature;
      this.#ui.result.hidden = false;
      this.#ui.verification.textContent = `Verified locally against the selected address · ${signed.format}`;
    } catch (cause) {
      if (revision === this.#revision && this.#context === active) this.#failure(cause);
    } finally {
      try {
        worker?.terminate(new DerivationCancelledError("Message-signing worker released."));
      } catch (cause) {
        if (revision === this.#revision) this.#failure(cause);
      } finally {
        if (revision === this.#revision) {
          this.#worker = undefined;
          this.#ui.sign.disabled = false;
          this.#ui.sign.textContent = SIGN_LABEL;
        }
      }
    }
  }

  /** Releases native listeners and all operation state when the host retires this feature. */
  [Symbol.dispose](): void {
    try {
      this.close();
    } finally {
      this.#disposed = true;
      try {
        this.#verification[Symbol.dispose]();
      } finally {
        this.#events.dispose();
      }
    }
  }
}

/** Installer for the edition's selected policy. */
export function createMessageSigningInstaller(policy: MessageSigningPolicy) {
  return (options: MessageSigningFeatureOptions) => new MessageSigningFeature(options, policy);
}
