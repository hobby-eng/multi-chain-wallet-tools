const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { ignoreBOM: true });

/** A clipboard refusal without supplied text or native exception details. */
export class ClipboardWriteError extends Error {
  readonly code: "clipboard.empty" | "clipboard.write" | "clipboard.closed";
  constructor(code: ClipboardWriteError["code"]) {
    const messages = {
      "clipboard.empty": "There is nothing to copy.",
      "clipboard.write": "Clipboard access failed.",
      "clipboard.closed": "This clipboard request has already ended.",
    };
    super(messages[code]);
    this.name = "ClipboardWriteError";
    this.code = code;
  }
}

/** Owns the fallback text as mutable bytes until the requested native write ends or is cancelled. */
export class ClipboardWrite implements Disposable {
  readonly #bytes: Uint8Array;
  #started = false;
  #retired = false;

  constructor(value: string) {
    if (value.length === 0) throw new ClipboardWriteError("clipboard.empty");
    this.#bytes = ENCODER.encode(value);
  }

  /** Writes only user-requested text; cancellation prevents a later legacy fallback. Never reads the clipboard. */
  async write(signal?: AbortSignal): Promise<void> {
    if (this.#retired || this.#started) throw new ClipboardWriteError("clipboard.closed");
    this.#started = true;
    const revoke = (): void => this.wipe();
    signal?.addEventListener("abort", revoke, { once: true });
    try {
      if (this.#revoked(signal)) return;
      try {
        if (navigator.clipboard?.writeText !== undefined) {
          // The browser receives an immutable temporary view; its copies cannot be recalled.
          await navigator.clipboard.writeText(DECODER.decode(this.#bytes));
          return;
        }
      } catch {
        // The legacy edge remains available after a native denial, unless its owner revoked it.
      }
      if (this.#revoked(signal)) return;
      this.#legacy();
    } finally {
      signal?.removeEventListener("abort", revoke);
      this.wipe();
    }
  }

  #legacy(): void {
    let temporary: HTMLTextAreaElement | undefined;
    try {
      temporary = document.createElement("textarea");
      temporary.value = DECODER.decode(this.#bytes);
      temporary.readOnly = true;
      temporary.tabIndex = -1;
      temporary.style.position = "fixed";
      temporary.style.inset = "0 auto auto -9999px";
      temporary.style.opacity = "0";
      document.body.append(temporary);
      temporary.select();
      if (!document.execCommand("copy")) throw new ClipboardWriteError("clipboard.write");
    } catch {
      throw new ClipboardWriteError("clipboard.write");
    } finally {
      if (temporary !== undefined) {
        // Clearing releases the DOM's immutable string reference, without promising runtime erasure.
        temporary.value = "";
        temporary.remove();
      }
    }
  }

  #revoked(signal: AbortSignal | undefined): boolean {
    return this.#retired || signal?.aborted === true;
  }

  /** Best-effort clearing of mutable fallback storage; cannot erase an operating-system copy. */
  wipe(): void {
    this.#retired = true;
    this.#bytes.fill(0);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }

  /** Compatibility entry: retain no input string across the native wait. */
  static start(value: string, signal?: AbortSignal): Promise<void> {
    try {
      const owner = new ClipboardWrite(value);
      return owner.write(signal);
    } catch (cause) {
      return Promise.reject(cause);
    } finally {
      value = "";
    }
  }
}

/** Writes requested text, with optional owner cancellation; cancellation is a normal completion. */
export const writeClipboard = ClipboardWrite.start.bind(ClipboardWrite);
