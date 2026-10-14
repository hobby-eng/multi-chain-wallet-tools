// "Open a file" beside a text field: the text of a local file, such as a saved record or a file of
// shares, put into the field as if it were pasted. The file is read in the page only; nothing else
// of it is kept.
import { MEBIBYTE } from "@ckd/core/byte-units.js";
import { FileChoice } from "./file-choice.js";

/** MnemoCode reads at most 1 MiB from a record or share file (its RECORD_FILE_LIMIT). */
export const TEXT_FILE_LIMIT_BYTES = MEBIBYTE;

const LITERAL_FILE_IMPORT_LABEL = "Open a text file";
const FILE_TOO_LARGE = "That file is larger than 1 MiB; it cannot be the one.";
const FILE_NOT_TEXT = "That file is not text.";
const FILE_UNREADABLE = "The file could not be read.";
const FILE_CANNOT_PRESERVE = "That file contains characters this field cannot preserve.";
const FILE_NOT_ACCEPTED = "That file is not accepted by this field.";

/** Known refusals contain fixed host text; a File reader's own error is never shown verbatim. */
class TextFileRefused extends Error {}

export function installTextFileImport(
  document: Document,
  target: HTMLInputElement | HTMLTextAreaElement,
  options: Readonly<{
    label?: string;
    /** The file kinds offered by the browser's picker, such as ".mnc,.txt,text/plain". */
    accept: string;
    /** Inputs preserve literal text; textareas keep their existing trimmed import by default. */
    preserveWhitespace?: boolean;
    /** File presentation only: BIP39's CLI reader drops one final LF or CRLF, keeping spaces. */
    stripFinalLineBreak?: boolean;
    /** A field's library parser owns any further normalization and validation. */
    normalize?(text: string): string;
    /** An exact-value owner; assign emits the same bubbling input event as a plain field. */
    value?: Readonly<{ read(): string; assign(text: string): void }>;
    onError?(message: string): void;
  }>,
): void {
  const input = target.tagName.toUpperCase() === "INPUT";
  const literal = options.preserveWhitespace ?? input;
  const say =
    options.onError ??
    ((message: string): void => {
      target.setCustomValidity(message);
      target.reportValidity();
    });
  const choice = FileChoice.create(document, options.label ?? LITERAL_FILE_IMPORT_LABEL, {
    accept: options.accept,
  });
  target.after(...choice.elements);
  let revision = 0;
  document.defaultView?.addEventListener("pagehide", () => {
    revision += 1;
  });
  for (const type of ["input", "change"])
    target.addEventListener(type, () => {
      revision += 1;
      if (options.onError === undefined) target.setCustomValidity("");
    });
  choice.onChoose(() => {
    const readRevision = ++revision;
    const file = choice.file;
    choice.clear();
    if (file === undefined || target.disabled) return;
    const previousValue = options.value?.read() ?? target.value;
    const previousPresentation = target.value;
    const previousType = target.type;
    const current = (): boolean =>
      revision === readRevision &&
      target.value === previousPresentation &&
      (options.value?.read() ?? target.value) === previousValue &&
      target.type === previousType &&
      !target.disabled;
    void (async () => {
      let bytes: Uint8Array | undefined;
      try {
        if (file.size > TEXT_FILE_LIMIT_BYTES) throw new TextFileRefused(FILE_TOO_LARGE);
        bytes = new Uint8Array(await file.arrayBuffer());
        if (!current()) return;
        if (bytes.byteLength > TEXT_FILE_LIMIT_BYTES) throw new TextFileRefused(FILE_TOO_LARGE);
        // A BOM may be part of a BIP39 password. Only a field's own parser may discard it.
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
        const presented = options.stripFinalLineBreak ? text.replace(/\r?\n$/, "") : text;
        let value: string;
        if (options.normalize === undefined) value = literal ? presented : presented.trim();
        else {
          try {
            value = options.normalize(presented);
          } catch {
            // A supplied parser must not expose file contents through its diagnostic.
            throw new TextFileRefused(FILE_NOT_ACCEPTED);
          }
        }
        if (options.value !== undefined) options.value.assign(value);
        else {
          target.value = value;
          // Without an exact-value owner, never silently accept a sanitized secret or key.
          if ((literal || input) && target.value !== value) {
            target.value = previousPresentation;
            throw new TextFileRefused(FILE_CANNOT_PRESERVE);
          }
          target.dispatchEvent(new Event("input", { bubbles: true }));
        }
      } catch (cause) {
        if (current())
          say(
            cause instanceof TypeError
              ? FILE_NOT_TEXT
              : cause instanceof TextFileRefused
                ? cause.message
                : FILE_UNREADABLE,
          );
      } finally {
        bytes?.fill(0);
      }
    })();
  });
}
