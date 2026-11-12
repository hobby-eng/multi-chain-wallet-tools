import type { MessageSigningRequest } from "@ckd/coins/message-signing.js";
import type { Bip322VerificationError } from "@ckd/core/bip322-verifier.js";
import type { RecoverableSignatureError } from "@ckd/core/message-signing-recoverable.js";
import {
  isCompactSignature,
  type CompactMessageError,
} from "@ckd/core/compact-message-internal.js";
import { MessageSignatureText, MessageSignatureTextError } from "@ckd/core/message-signature.js";
import { UiEventScope } from "@ckd/ui/ui-event-scope.js";
import { DerivationCancelledError, type DerivationWorkerClient } from "../workers/derive-client.js";
import { DerivationErrorText } from "./derivation-error-text.js";

type VerifyingWorker = Pick<DerivationWorkerClient, "verifyMessage" | "terminate">;

/** The public request of the dialog's address, format and message, and the format's label. */
export interface MessageVerificationTarget {
  /** The adapter of the dialog's row, whose coin must own the format. */
  readonly adapterId: string;
  readonly request: MessageSigningRequest;
  readonly label: string;
  /** The label of another offered format whose signatures are compact, if the address has one. */
  readonly compactAlternative?: string;
}

/** The dialog's edges that a verification borrows. */
export interface MessageVerificationOptions {
  document: Document;
  createWorker(): VerifyingWorker;
  /** The current target; it throws the dialog's own refusals, such as an unoffered format. */
  target(): MessageVerificationTarget;
  /** The text of a refusal that the page itself raised, or undefined for any other failure. */
  refusalText(cause: unknown): string | undefined;
}

const VERIFY_LABEL = "Verify signature";
const VERIFYING_LABEL = "Verifying…";
const FAILED = "The signature could not be checked.";
const UNREADABLE = "This signature is not in the selected format.";
// The verifiers' refusals of the pasted signature itself, by code; any other failure is the
// tool's, and reads as FAILED.
const SIGNATURE_REFUSALS: ReadonlyMap<unknown, string> = new Map<
  CompactMessageError["code"] | Bip322VerificationError["code"] | RecoverableSignatureError["code"],
  string
>([
  ["INVALID_HEX", UNREADABLE],
  ["INVALID_V", UNREADABLE],
  // TronWeb's verifyMessageV2 refuses the high-S twin of a signature: so does the dialog.
  ["HIGH_S", UNREADABLE],
  ["INVALID_BASE64", UNREADABLE],
  ["INVALID_SIGNATURE_LENGTH", UNREADABLE],
  ["INVALID_HEADER", UNREADABLE],
  ["UNREADABLE_SIGNATURE", UNREADABLE],
  // A simple signature on a P2PKH or nested SegWit row: that row's BIP-322 format is the full one.
  ["SIMPLE_FOR_ADDRESS", UNREADABLE],
  ["RECOVERY_FAILED", "No public key can be recovered from this signature: it is damaged."],
]);

/** Verifies a pasted signature for the dialog's address in a disposable worker, without a seed. */
export class MessageSigningVerification implements Disposable {
  readonly #options: MessageVerificationOptions;
  readonly #events = new UiEventScope((cause) => this.#failure(cause));
  readonly #ui;
  #worker: VerifyingWorker | undefined;
  #revision = 0;

  constructor(options: MessageVerificationOptions) {
    this.#options = options;
    const required = <T extends HTMLElement>(selector: string): T | null =>
      options.document.querySelector<T>(selector);
    this.#ui = {
      signature: required<HTMLTextAreaElement>("#message-verification-signature"),
      verify: required<HTMLButtonElement>("#verify-message-signature-button"),
      error: required<HTMLElement>("#message-verification-error"),
      result: required<HTMLElement>("#message-verification-result"),
    };
    const { signature, verify } = this.#ui;
    if (signature !== null) this.#events.listen(signature, "input", this.reset);
    if (verify !== null)
      this.#events.listen(verify, "click", () => {
        void this.#verify();
      });
  }

  /** Revokes a pending check and its displayed answer; the pasted signature stays. */
  readonly reset = (): void => {
    this.#revision += 1;
    const worker = this.#worker;
    this.#worker = undefined;
    try {
      worker?.terminate(new DerivationCancelledError("Message verification superseded."));
    } finally {
      const { verify, error, result } = this.#ui;
      if (result !== null) result.textContent = "";
      if (error !== null) {
        error.textContent = "";
        error.hidden = true;
      }
      if (verify !== null) {
        verify.disabled = false;
        verify.textContent = VERIFY_LABEL;
      }
    }
  };

  /** Revokes the check and empties the pasted signature, when the dialog closes. */
  clear(): void {
    try {
      this.reset();
    } finally {
      if (this.#ui.signature !== null) this.#ui.signature.value = "";
    }
  }

  /** Shows a refusal of the check; it never repeats the pasted text. */
  #failure(cause: unknown, target?: MessageVerificationTarget, signature = ""): void {
    const { error, result } = this.#ui;
    if (result !== null) result.textContent = "";
    if (error === null) return;
    error.textContent = this.#refusalText(cause, target, signature);
    error.hidden = false;
  }

  /** The page's own refusals as they are; a compact signature under another format points there. */
  #refusalText(cause: unknown, target: MessageVerificationTarget | undefined, signature: string) {
    if (cause instanceof MessageSignatureTextError) return cause.message;
    const own = this.#options.refusalText(cause);
    if (own !== undefined) return own;
    const code =
      typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
    const refusal = SIGNATURE_REFUSALS.get(code);
    const compact = target?.compactAlternative;
    if (refusal === UNREADABLE && compact !== undefined && isCompactSignature(signature))
      return `This is a compact signature: choose “${compact}” as the signature format to check it.`;
    return refusal ?? DerivationErrorText.of(cause, FAILED);
  }

  async #verify(): Promise<void> {
    const { signature, verify, result } = this.#ui;
    if (signature === null || verify === null || result === null) return;
    this.reset();
    const revision = this.#revision;
    let worker: VerifyingWorker | undefined;
    let target: MessageVerificationTarget | undefined;
    const pasted = signature.value;
    try {
      target = this.#options.target();
      MessageSignatureText.require(pasted);
      verify.disabled = true;
      verify.textContent = VERIFYING_LABEL;
      worker = this.#options.createWorker();
      this.#worker = worker;
      const valid = await worker.verifyMessage(target.adapterId, target.request, pasted);
      if (revision !== this.#revision) return;
      result.textContent = valid
        ? `Valid for ${target.request.address} · ${target.label}`
        : `Not valid for this address · ${target.label}`;
    } catch (cause) {
      if (revision === this.#revision) this.#failure(cause, target, pasted);
    } finally {
      try {
        worker?.terminate(new DerivationCancelledError("Message verification worker released."));
      } finally {
        if (revision === this.#revision) {
          this.#worker = undefined;
          verify.disabled = false;
          verify.textContent = VERIFY_LABEL;
        }
      }
    }
  }

  /** Releases the listeners and any pending check when the host retires the dialog. */
  [Symbol.dispose](): void {
    try {
      this.clear();
    } finally {
      this.#events.dispose();
    }
  }
}
