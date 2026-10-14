import {
  INVALID_PNG_INPUT,
  MAX_PNG_BYTES,
  PngAdmission,
} from "../../recovery-mnemocode/source/core/png-admission.js";

export const PNG_MIME_TYPE = "image/png";
export const PNG_BOUNDED_DECODER_UNAVAILABLE =
  "PNG import requires a browser with bounded DecompressionStream deflate decoding.";
export const PNG_IMAGE_DECODE_FAILED = "The PNG image could not be decoded.";

// Small compressed inputs limit the work queued inside the browser before overflow cancellation.
const INFLATE_INPUT_CHUNK_BYTES = 1024;

/** The host supplies streaming inflation, never a decoder that collects the full expansion. */
export type PngInflateReader = Pick<
  ReadableStreamDefaultReader<Uint8Array>,
  "read" | "cancel" | "releaseLock"
>;

function openDeflateReader(compressed: Uint8Array): PngInflateReader {
  const buffer = compressed.buffer;
  if (!(buffer instanceof ArrayBuffer)) throw new Error(INVALID_PNG_INPUT);
  // Keep the owned backing buffer while narrowing the view to the DOM's non-shared input type.
  const input = new Uint8Array(buffer, compressed.byteOffset, compressed.byteLength);
  const decompressor = new DecompressionStream("deflate");
  let offset = 0;
  const source = new ReadableStream<BufferSource>(
    {
      pull(controller) {
        if (offset === input.byteLength) {
          controller.close();
          return;
        }
        const end = Math.min(input.byteLength, offset + INFLATE_INPUT_CHUNK_BYTES);
        controller.enqueue(input.subarray(offset, end));
        offset = end;
      },
    },
    { highWaterMark: 0 },
  );
  return source.pipeThrough(decompressor).getReader();
}

/** Owns one PNG snapshot through admission and decoding, then wipes its accessible bytes. */
export class BrowserPngAdmission {
  readonly #openReader: (compressed: Uint8Array) => PngInflateReader;

  constructor(openReader: (compressed: Uint8Array) => PngInflateReader = openDeflateReader) {
    this.#openReader = openReader;
  }

  /** Classification only: MIME labels cannot exempt PNG bytes from admission. */
  static hasSignature(bytes: Uint8Array): boolean {
    return PngAdmission.hasSignature(bytes);
  }

  async decode<T>(
    input: Uint8Array,
    decoder: (ownedPng: Uint8Array<ArrayBuffer>) => Promise<T>,
  ): Promise<T> {
    // Ask the core to refuse oversized input before allocating an owned snapshot.
    if (input.byteLength > MAX_PNG_BYTES) PngAdmission.read(input);
    const owned = new Uint8Array(input);
    try {
      const admitted = PngAdmission.read(owned);
      await this.#checkInflation(admitted);
      try {
        return await decoder(owned);
      } catch {
        // Decoder exceptions can contain private image details; expose only fixed host text.
        throw new Error(PNG_IMAGE_DECODE_FAILED);
      }
    } finally {
      owned.fill(0);
    }
  }

  async #checkInflation(admitted: PngAdmission): Promise<void> {
    const compressed = admitted.compressedData();
    try {
      let reader: PngInflateReader;
      try {
        reader = this.#openReader(compressed);
      } catch {
        // Unsupported deflate decoding fails closed, before any image decoder is called.
        throw new Error(PNG_BOUNDED_DECODER_UNAVAILABLE);
      }
      let complete = false;
      try {
        let length = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          try {
            if (value.byteLength > admitted.filteredBytes - length)
              admitted.assertInflatedSize(length + value.byteLength);
            length += value.byteLength;
          } finally {
            // No expanded image is collected: each delivered chunk is wiped immediately.
            value.fill(0);
          }
        }
        // Reaching the budget is not EOF: a later byte must still refuse the image.
        admitted.assertInflatedSize(length);
        complete = true;
      } catch {
        throw new Error(INVALID_PNG_INPUT);
      } finally {
        if (!complete) {
          try {
            await reader.cancel();
          } catch {
            // Cancellation is best effort; neither its exception nor image content is retained.
          }
        }
        try {
          reader.releaseLock();
        } catch {
          throw new Error(INVALID_PNG_INPUT);
        }
      }
    } finally {
      compressed.fill(0);
    }
  }
}
