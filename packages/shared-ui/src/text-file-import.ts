// Local file presentation shares revision and byte ownership with QR imports. No file leaves the page.
import { MEBIBYTE } from "@ckd/core/byte-units.js";
import { FieldImportRevision, type FieldImportCapture } from "./field-import-revision.js";
import { FileChoice } from "./file-choice.js";

/** MnemoCode reads at most 1 MiB from a record or share file (its RECORD_FILE_LIMIT). */
export const TEXT_FILE_LIMIT_BYTES = MEBIBYTE;

const LITERAL_FILE_IMPORT_LABEL = "Open a text file";
const FILE_ERRORS = {
  size: "That file is larger than 1 MiB; it cannot be the one.",
  combined:
    "The combined text is larger than 1 MiB; remove some records before importing another file.",
  text: "That file is not text.",
  read: "The file could not be read.",
  preserve: "That file contains characters this field cannot preserve.",
  accepted: "That file is not accepted by this field.",
} as const;
type TextFileErrorCode = keyof typeof FILE_ERRORS;

/** Known refusals carry no file contents or native reader error. */
class TextFileRefusedError extends Error {
  readonly code: TextFileErrorCode;

  constructor(code: TextFileErrorCode) {
    super(code);
    this.code = code;
  }
}

/** A field's library owns parsing; this adapter owns bounded, revocable local file presentation. */
export interface TextFileImportOptions {
  readonly label?: string;
  /** The picker kinds, such as ".mnc,.txt,text/plain"; this is not content validation. */
  readonly accept: string;
  /** Append line-oriented records, with combined UTF-8 text bounded by TEXT_FILE_LIMIT_BYTES. */
  readonly append?: boolean;
  /** Inputs preserve literal text; textareas keep trimmed import by default. */
  readonly preserveWhitespace?: boolean;
  /** BIP39's CLI reader drops one final LF or CRLF, keeping spaces. */
  readonly stripFinalLineBreak?: boolean;
  /** A field's library parser owns further normalization and validation. */
  normalize?(text: string): string;
  /** An exact-value owner; assign emits the same bubbling input event as a plain field. */
  readonly value?: Readonly<{ read(): string; assign(text: string): void }>;
  onError?(message: string): void;
}

/** Reads one selected file; cancellation, edits and field retirement revoke pending publication. */
export class TextFileImport {
  readonly #target: HTMLInputElement | HTMLTextAreaElement;
  readonly #options: TextFileImportOptions;
  readonly #input: boolean;
  readonly #literal: boolean;

  /** Installs the chooser; oversize, malformed or unpreservable text produces a fixed refusal. */
  constructor(
    document: Document,
    target: HTMLInputElement | HTMLTextAreaElement,
    options: TextFileImportOptions,
  ) {
    this.#target = target;
    this.#options = { ...options };
    this.#input = target.tagName.toUpperCase() === "INPUT";
    this.#literal = options.preserveWhitespace ?? this.#input;
    const choice = FileChoice.create(document, options.label ?? LITERAL_FILE_IMPORT_LABEL, {
      accept: options.accept,
    });
    target.after(...choice.elements);
    const revisions = new FieldImportRevision(document, target);
    for (const type of ["input", "change"])
      target.addEventListener(type, () => {
        if (options.onError === undefined) target.setCustomValidity("");
      });
    choice.onChoose(() => {
      revisions.revise();
      const file = choice.file;
      choice.clear();
      if (file === undefined || target.disabled || !target.isConnected) return;
      this.#start(file, revisions);
    });
  }

  #start(file: File, revisions: FieldImportRevision): void {
    try {
      if (file.size > TEXT_FILE_LIMIT_BYTES) throw new TextFileRefusedError("size");
      const read = (): string => this.#options.value?.read() ?? this.#target.value;
      if (this.#options.append === true) {
        // Refuse impossible prior input before creating owned snapshots, joined text or a read.
        if (this.#target.value.length > TEXT_FILE_LIMIT_BYTES)
          throw new TextFileRefusedError("combined");
        const previous = read();
        if (previous.length > TEXT_FILE_LIMIT_BYTES) throw new TextFileRefusedError("combined");
        this.#checkCombined(previous);
      }
      void this.#read(file, revisions.capture(read));
    } catch (cause) {
      this.#say(cause);
    }
  }

  async #read(file: File, capture: FieldImportCapture): Promise<void> {
    using current = capture;
    let bytes: Uint8Array | undefined;
    try {
      if (file.size > TEXT_FILE_LIMIT_BYTES) throw new TextFileRefusedError("size");
      bytes = new Uint8Array(await file.arrayBuffer());
      if (!current.current()) return;
      if (bytes.byteLength > TEXT_FILE_LIMIT_BYTES) throw new TextFileRefusedError("size");
      // A BOM may be part of a BIP39 password. Only a field's own parser may discard it.
      const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      const incoming = this.#normalize(text);
      // Parsers and exact-value readers may synchronously revoke the captured field.
      if (!current.current()) return;
      const value = current.importedText(incoming, this.#options.append === true);
      if (this.#options.append === true) this.#checkCombined(value);
      if (!current.current()) return;
      this.#publish(value, current);
    } catch (cause) {
      if (current.current()) this.#say(cause);
    } finally {
      bytes?.fill(0);
    }
  }

  #normalize(text: string): string {
    const presented = this.#options.stripFinalLineBreak ? text.replace(/\r?\n$/, "") : text;
    if (this.#options.normalize === undefined) return this.#literal ? presented : presented.trim();
    try {
      return this.#options.normalize(presented);
    } catch {
      throw new TextFileRefusedError("accepted");
    }
  }

  #checkCombined(value: string): void {
    const bytes = new TextEncoder().encode(value);
    try {
      if (bytes.byteLength > TEXT_FILE_LIMIT_BYTES) throw new TextFileRefusedError("combined");
    } finally {
      bytes.fill(0);
    }
  }

  #publish(value: string, capture: FieldImportCapture): void {
    if (this.#options.value !== undefined) this.#options.value.assign(value);
    else {
      this.#target.value = value;
      // Without an exact-value owner, never silently accept a sanitized secret or key.
      if ((this.#literal || this.#input) && this.#target.value !== value) {
        this.#target.value = capture.presentation;
        throw new TextFileRefusedError("preserve");
      }
      this.#target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  #say(cause: unknown): void {
    const code =
      cause instanceof TextFileRefusedError
        ? cause.code
        : cause instanceof TypeError
          ? "text"
          : "read";
    const message = FILE_ERRORS[code];
    if (this.#options.onError !== undefined) this.#options.onError(message);
    else {
      this.#target.setCustomValidity(message);
      this.#target.reportValidity();
    }
  }
}

/** Compatibility installer; TextFileImport owns the chooser and the pending operation. */
export function installTextFileImport(
  document: Document,
  target: HTMLInputElement | HTMLTextAreaElement,
  options: TextFileImportOptions,
): void {
  new TextFileImport(document, target, options);
}
