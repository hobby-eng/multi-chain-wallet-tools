import decodeQr from "qr/decode.js";
import { MEBIBYTE } from "@ckd/core/byte-units.js";
import { FileChoice } from "./file-choice.js";
import { BrowserPngAdmission, PNG_MIME_TYPE } from "./png-admission.js";

const MAX_IMAGE_BYTES = 20 * MEBIBYTE;
const MAX_DECODE_DIMENSION = 4096;
const PNG_ADMISSION = new BrowserPngAdmission();

export interface DecodedQrImage {
  readonly text: string;
  /** Present when the QR contains one byte-mode segment, including embedded NUL/CR/LF bytes. */
  readonly binaryData?: Uint8Array;
}

export function decodeQrPixels(
  image: Readonly<{ width: number; height: number; data: Uint8ClampedArray }>,
): DecodedQrImage {
  const byteSegments: Uint8Array[] = [];
  const textDecoder = new TextDecoder("utf-8", { fatal: false });
  const text = decodeQr(image, {
    effort: 3,
    timeLimit: 1500,
    textDecoder(bytes) {
      byteSegments.push(bytes.slice());
      return textDecoder.decode(bytes);
    },
  });
  if (byteSegments.length === 1) return { text, binaryData: byteSegments[0]! };
  return { text };
}

async function decodeQrImage(file: File): Promise<DecodedQrImage> {
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
    if (file.type === PNG_MIME_TYPE || BrowserPngAdmission.hasSignature(bytes)) {
      // decode() owns its snapshot synchronously, so the file-read buffer can be wiped now.
      return PNG_ADMISSION.decode(bytes, (owned) =>
        decodeQrBlob(new Blob([owned], { type: PNG_MIME_TYPE })),
      );
    }
  } finally {
    bytes.fill(0);
  }
  return decodeQrBlob(file);
}

async function decodeQrBlob(file: Blob): Promise<DecodedQrImage> {
  const bitmap = await createImageBitmap(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
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

export function installQrImageImport(
  document: Document,
  target: HTMLTextAreaElement,
  options: Readonly<{
    label?: string;
    multiple?: boolean;
    onDecoded?(decoded: DecodedQrImage): string;
    onError?(message: string): void;
  }> = {},
): void {
  const choice = FileChoice.create(document, options.label ?? "Import QR image", {
    accept: "image/png,image/jpeg,image/webp,image/gif,image/bmp",
    multiple: options.multiple === true,
  });
  target.after(...choice.elements);
  choice.onChoose(() => {
    const files = choice.files;
    choice.clear();
    if (files.length === 0) return;
    void (async () => {
      try {
        const values: string[] = [];
        for (const file of files) {
          const decoded = await decodeQrImage(file);
          values.push(options.onDecoded?.(decoded) ?? decoded.text);
        }
        const incoming = values.filter((value) => value.length > 0).join("\n");
        target.value =
          options.multiple === true && target.value.trim() !== ""
            ? `${target.value.trim()}\n${incoming}`
            : incoming;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (cause) {
        options.onError?.(
          cause instanceof Error ? cause.message : "The QR image could not be decoded.",
        );
      }
    })();
  });
}
