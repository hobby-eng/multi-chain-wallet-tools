import { bip39WordCountOfEntropy } from "@ckd/core/bip39-parameters.js";
import { Slip39Passphrase } from "./slip39-passphrase.js";
import { nonEmptyLines } from "@ckd/core/text-lines.js";
import { Slip39, type Slip39Work } from "./slip39.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const ERRORS = new ErrorCatalog("wallet.slip39-restore", {
  closed: () => "This SLIP-39 request has already been transferred or released.",
  request: () => "The SLIP-39 worker request is invalid.",
  text: () => "The SLIP-39 worker request is not valid text.",
  entropy: () => "These SLIP-39 shares do not encode a BIP39 entropy size.",
  consent: () => "Confirm the assessed SLIP-39 work before starting recovery.",
});

/** Exclusive mutable input transferred to one worker; never contains a script or storage path. */
export interface Slip39RestoreWire {
  readonly shares: Uint8Array<ArrayBuffer>;
  readonly passphrase: Uint8Array<ArrayBuffer>;
  readonly confirmed: boolean;
}

/** Owns inputs for a BIP39 phrase restore, as page-side bytes or received worker buffers. */
export class Slip39RestoreRequest implements Disposable {
  readonly #shares: Uint8Array<ArrayBuffer>;
  readonly #passphrase: Uint8Array<ArrayBuffer>;
  readonly #confirmed: boolean;
  #closed = false;

  /** String input is encoded immediately; wire input transfers ownership without another copy. */
  constructor(source: unknown, passphrase = "") {
    if (typeof source === "string") {
      if (typeof passphrase !== "string") throw ERRORS.create("request", []);
      this.#shares = ENCODER.encode(source);
      try {
        this.#passphrase = ENCODER.encode(passphrase);
      } catch (cause) {
        this.#shares.fill(0);
        throw cause;
      }
      this.#confirmed = false;
    } else {
      let shares: unknown;
      let password: unknown;
      try {
        if (typeof source !== "object" || source === null) throw ERRORS.create("request", []);
        shares = "shares" in source ? source.shares : undefined;
        password = "passphrase" in source ? source.passphrase : undefined;
        const confirmed = "confirmed" in source ? source.confirmed : undefined;
        if (
          !Slip39RestoreRequest.#bytes(shares) ||
          !Slip39RestoreRequest.#bytes(password) ||
          typeof confirmed !== "boolean"
        )
          throw ERRORS.create("request", []);
        this.#shares = shares;
        this.#passphrase = password;
        this.#confirmed = confirmed;
      } catch {
        // A received wire transfers ownership, including its admitted buffers on later refusal.
        for (const bytes of [shares, password])
          if (Slip39RestoreRequest.#bytes(bytes) && bytes.byteLength !== 0) bytes.fill(0);
        throw ERRORS.create("request", []);
      }
    }
  }

  static #bytes(value: unknown): value is Uint8Array<ArrayBuffer> {
    return value instanceof Uint8Array && value.buffer instanceof ArrayBuffer;
  }

  #assertLive(): void {
    if (this.#closed) throw ERRORS.create("closed", []);
  }

  #text(bytes: Uint8Array): string {
    try {
      return DECODER.decode(bytes);
    } catch {
      throw ERRORS.create("text", []);
    }
  }

  /** Performs actual set/quorum/digest admission without passphrase stretching; retains no plan. */
  assess(): Slip39Work {
    this.#assertLive();
    using plan = Slip39.prepare(nonEmptyLines(this.#text(this.#shares)));
    this.#admit(plan.work);
    return plan.work;
  }

  /** Hands off one request and its buffers; wipe still clears them if native transfer refuses. */
  take(confirmed = false): { request: Slip39RestoreWire; transfer: readonly ArrayBuffer[] } {
    this.#assertLive();
    this.#closed = true;
    return {
      request: { shares: this.#shares, passphrase: this.#passphrase, confirmed },
      transfer: [this.#shares.buffer, this.#passphrase.buffer],
    };
  }

  /** Worker operation; independently checks admission and confirmation before its synchronous KDF. */
  recover(): Uint8Array {
    this.#assertLive();
    using plan = Slip39.prepare(nonEmptyLines(this.#text(this.#shares)));
    this.#admit(plan.work);
    if (plan.work.requiresConfirmation && !this.#confirmed) throw ERRORS.create("consent", []);
    return plan.recover(this.#text(this.#passphrase));
  }

  #admit(work: Slip39Work): void {
    if (bip39WordCountOfEntropy(work.valueBytes) === undefined) throw ERRORS.create("entropy", []);
    Slip39Passphrase.assert(this.#passphrase);
  }

  /** Clears owned inputs; detached transfer buffers are already outside this owner's realm. */
  wipe(): void {
    this.#closed = true;
    for (const bytes of [this.#shares, this.#passphrase]) if (bytes.byteLength !== 0) bytes.fill(0);
  }

  /** Ends this input lifetime, including native postMessage failure. */
  [Symbol.dispose](): void {
    this.wipe();
  }
}
