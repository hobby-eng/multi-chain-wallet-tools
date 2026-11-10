import decodeQr from "qr/decode.js";
import { MEBIBYTE } from "@ckd/core/byte-units.js";
import { FieldImportRevision, type FieldImportCapture } from "./field-import-revision.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { FileChoice } from "./file-choice.js";
import { BrowserPngAdmission, PNG_MIME_TYPE } from "./png-admission.js";
import { qrText } from "./qr-text.js";

const MAX_IMAGE_BYTES = 20 * MEBIBYTE;
const MAX_DECODE_DIMENSION = 4096;
const PNG_ADMISSION = new BrowserPngAdmission();

export interface DecodedQrImage {
  /** The text of the QR code; U+FFFD stands for the bytes of a segment that are not UTF-8. */
  readonly text: string;
  /** Whether every byte segment is valid UTF-8 text, so that `text` is what was written. */
  readonly utf8: boolean;
  /** Present when the QR contains one byte-mode segment, including embedded NUL/CR/LF bytes. */
  readonly binaryData?: Uint8Array;
}

export function decodeQrPixels(
  image: Readonly<{ width: number; height: number; data: Uint8ClampedArray }>,
): DecodedQrImage {
  const byteSegments: Uint8Array[] = [];
  const textDecoder = new TextDecoder("utf-8", { fatal: false });
  const strictDecoder = new TextDecoder("utf-8", { fatal: true });
  let utf8 = true;
  try {
    const text = decodeQr(image, {
      effort: 3,
      timeLimit: 1500,
      textDecoder(bytes) {
        byteSegments.push(bytes.slice());
        try {
          strictDecoder.decode(bytes);
        } catch (cause) {
          // TextDecoder refuses with a TypeError, which names no byte of the text.
          if (!(cause instanceof TypeError)) throw cause;
          utf8 = false;
        }
        return textDecoder.decode(bytes);
      },
    });
    const binaryData = byteSegments.length === 1 ? byteSegments.pop() : undefined;
    return binaryData === undefined ? { text, utf8 } : { text, utf8, binaryData };
  } finally {
    for (const bytes of byteSegments) bytes.fill(0);
  }
}

/**
 * Reads a record a QR's PNG keeps beyond what ordinary scanners show, such as MnemoCode's hidden
 * QR record; undefined where the image keeps none, and the image is then read as any QR code.
 */
export type HiddenQrReader = (png: Uint8Array) => string | undefined;

async function decodeQrImage(
  file: File,
  current: () => boolean,
  readHidden?: HiddenQrReader,
): Promise<DecodedQrImage | undefined> {
  if (!file.type.startsWith("image/"))
    throw new Error("Choose a PNG, JPEG, WebP, or other browser-readable image.");
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES)
    throw new Error("QR image must be between 1 byte and 20 MiB.");

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new Error("The QR image could not be read.");
  }
  try {
    if (!current()) return undefined;
    if (file.type === PNG_MIME_TYPE || BrowserPngAdmission.hasSignature(bytes)) {
      const hidden = readHidden?.(bytes);
      if (hidden !== undefined) return { text: hidden, utf8: true };
      // decode() owns its snapshot synchronously, so the file-read buffer can be wiped now.
      return PNG_ADMISSION.decode(bytes, (owned) =>
        decodeQrBlob(new Blob([owned], { type: PNG_MIME_TYPE }), current),
      );
    }
  } finally {
    bytes.fill(0);
  }
  return decodeQrBlob(file, current);
}

async function decodeQrBlob(
  file: Blob,
  current: () => boolean,
): Promise<DecodedQrImage | undefined> {
  const bitmap = await createImageBitmap(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (!current()) return undefined;
    const scale = Math.min(1, MAX_DECODE_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) throw new Error("Canvas image decoding is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    try {
      return decodeQrPixels(image);
    } finally {
      image.data.fill(0);
    }
  } finally {
    try {
      if (canvas !== undefined) {
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      bitmap.close();
    }
  }
}

/** Presentation callbacks borrow decoded bytes only until onDecoded returns. */
export interface QrImageImportOptions {
  readonly label?: string;
  readonly multiple?: boolean;
  /** Tried first on a PNG: the hidden record it keeps, read instead of the visible text. */
  readonly readHidden?: HiddenQrReader;
  onDecoded?(decoded: DecodedQrImage): string;
  onError?(message: string): void;
}

/** Owns one field's chooser and publication revisions through asynchronous image decoding. */
export class QrImageImport {
  readonly #target: HTMLTextAreaElement;
  readonly #options: QrImageImportOptions;
  readonly #inputs: FieldImportRevision;

  /** Installs local-only import; no callback or value publishes after the field lifetime changes. */
  constructor(document: Document, target: HTMLTextAreaElement, options: QrImageImportOptions = {}) {
    this.#target = target;
    this.#options = { ...options };
    this.#inputs = new FieldImportRevision(document, target);
    const choice = FileChoice.create(document, options.label ?? "Import QR image", {
      accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp",
      multiple: options.multiple === true,
    });
    target.after(...choice.elements);
    choice.onChoose(() => {
      this.#inputs.revise();
      const files = choice.files;
      choice.clear();
      if (files.length === 0 || target.disabled || !target.isConnected) return;
      void this.#read(files, this.#inputs.capture());
    });
  }

  async #read(files: readonly File[], capture: FieldImportCapture): Promise<void> {
    using current = capture;
    const values: SecretValue<readonly string[]>[] = [];
    try {
      for (const file of files) {
        if (!current.current()) return;
        const decoded = await decodeQrImage(
          file,
          () => current.current(),
          this.#options.readHidden,
        );
        if (decoded === undefined) return;
        try {
          if (!current.current()) return;
          const value = this.#options.onDecoded?.(decoded) ?? qrText(decoded);
          // A callback can synchronously edit the field or revoke the page lifetime.
          if (!current.current()) return;
          values.push(SecretValue.utf16Texts([value]));
        } finally {
          decoded.binaryData?.fill(0);
        }
      }
      if (!current.current()) return;
      const incoming = values
        .flatMap((value) => value.value)
        .filter((value) => value.length > 0)
        .join("\n");
      this.#target.value = current.importedText(incoming, this.#options.multiple === true);
      this.#target.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (cause) {
      if (current.current())
        this.#options.onError?.(
          cause instanceof Error ? cause.message : "The QR image could not be decoded.",
        );
    } finally {
      for (const value of values) value.wipe();
    }
  }
}

/** Thin browser installer; the class owns the operation, revisions and retained input lifetime. */
export function installQrImageImport(
  document: Document,
  target: HTMLTextAreaElement,
  options: QrImageImportOptions = {},
): void {
  new QrImageImport(document, target, options);
}
