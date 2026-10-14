import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INVALID_PNG_INPUT,
  MAX_PNG_DIMENSION,
  PngAdmission,
} from "../../recovery-mnemocode/source/core/png-admission.js";
import { CRC32_BYTES, crc32 } from "../../recovery-mnemocode/source/sskr/checksum.js";
import { FileChoice } from "../src/file-choice.js";
import {
  BrowserPngAdmission,
  PNG_BOUNDED_DECODER_UNAVAILABLE,
  PNG_IMAGE_DECODE_FAILED,
  PNG_MIME_TYPE,
  type PngInflateReader,
} from "../src/png-admission.js";
import { installQrImageImport } from "../src/qr-image-import.js";

vi.mock("qr/decode.js", () => ({ default: () => "public synthetic QR result" }));

// Tiny synthetic framing follows W3C PNG sections 5 and 11.2.1. These host tests use the
// shared CRC writer; independent validation of PNG's structural rules belongs to the core suite.
const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const LENGTH_BYTES = 4;
const IHDR_BYTES = 13;
// RFC 1950/1951: one stored deflate block for a filter byte and one black grayscale pixel.
const COMPRESSED_PIXEL = Uint8Array.of(0x78, 1, 1, 2, 0, 0xfd, 0xff, 0, 0, 0, 2, 0, 1);
const PIXEL_SCANLINE_BYTES = 2;

function joinBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function chunk(type: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const body = joinBytes(new TextEncoder().encode(type), payload);
  const result = new Uint8Array(LENGTH_BYTES + body.byteLength + CRC32_BYTES);
  const view = new DataView(result.buffer);
  view.setUint32(0, payload.byteLength);
  result.set(body, LENGTH_BYTES);
  view.setUint32(LENGTH_BYTES + body.byteLength, crc32(body));
  return result;
}

function png(
  options: Readonly<{ width?: number; height?: number; interlace?: number }> = {},
): Uint8Array<ArrayBuffer> {
  const header = new Uint8Array(IHDR_BYTES);
  const view = new DataView(header.buffer);
  // IHDR: big-endian width/height at 0/4, 8-bit grayscale, standard compression/filter.
  view.setUint32(0, options.width ?? 1);
  view.setUint32(4, options.height ?? 1);
  header[8] = 8;
  header[12] = options.interlace ?? 0;
  return joinBytes(
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", COMPRESSED_PIXEL),
    chunk("IEND", new Uint8Array()),
  );
}

function fakeReader(chunks: Uint8Array[], failure?: Error) {
  let next = 0;
  return {
    read: vi.fn(async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      const value = chunks[next];
      next += 1;
      if (value !== undefined) return { done: false, value };
      if (failure !== undefined) throw failure;
      return { done: true, value: undefined };
    }),
    cancel: vi.fn(async () => undefined),
    releaseLock: vi.fn(),
  } satisfies PngInflateReader;
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fakeDeflate(output: Uint8Array) {
  const formats: string[] = [];
  const inputChunks: Uint8Array[] = [];
  vi.stubGlobal(
    "DecompressionStream",
    class {
      readonly readable: ReadableStream<Uint8Array>;
      readonly writable: WritableStream<Uint8Array>;

      constructor(format: string) {
        formats.push(format);
        const stream = new TransformStream<Uint8Array, Uint8Array>({
          transform(bytes, controller) {
            inputChunks.push(bytes);
            controller.enqueue(output);
          },
        });
        this.readable = stream.readable;
        this.writable = stream.writable;
      }
    },
  );
  return { formats, inputChunks };
}

function fakeImageDecoder() {
  const pixels = Uint8ClampedArray.of(0, 0, 0, 255);
  const bitmap = { width: 1, height: 1, close: vi.fn() };
  const context = {
    drawImage: vi.fn(),
    getImageData: () => ({ width: 1, height: 1, data: pixels }),
  };
  const canvas = { width: 0, height: 0, getContext: () => context };
  vi.stubGlobal("document", { createElement: () => canvas });
  const decode = vi.fn(async (_blob: Blob) => bitmap);
  vi.stubGlobal("createImageBitmap", decode);
  return { decode, bitmap, canvas, context, pixels };
}

function importFile(file: File): Promise<{ text?: string; error?: string }> {
  return new Promise((resolve) => {
    let choose!: () => void;
    vi.spyOn(FileChoice, "create").mockReturnValue({
      elements: [],
      files: [file],
      clear: vi.fn(),
      onChoose(listener: () => void) {
        choose = listener;
      },
    } as unknown as FileChoice);
    const target = {
      value: "",
      after: vi.fn(),
      dispatchEvent() {
        resolve({ text: target.value });
        return true;
      },
    };
    installQrImageImport({} as Document, target as unknown as HTMLTextAreaElement, {
      onError: (error) => resolve({ error }),
    });
    choose();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browser PNG admission", () => {
  it("delegates signature classification to the shared core", () => {
    const bytes = png();
    expect(BrowserPngAdmission.hasSignature(bytes)).toBe(true);
    expect(BrowserPngAdmission.hasSignature(bytes.subarray(0, SIGNATURE.length - 1))).toBe(false);
    for (let index = 0; index < SIGNATURE.length; index += 1) {
      const changed = bytes.slice();
      changed[index]! ^= 1;
      expect(BrowserPngAdmission.hasSignature(changed)).toBe(false);
    }
  });

  it.each(["CRC", "dimensions", "duplicate header", "trailing bytes"])(
    "keeps the stream and decoder closed on a core %s refusal",
    async (problem) => {
      let bytes = png();
      if (problem === "CRC") bytes[bytes.length - 1]! ^= 1;
      if (problem === "dimensions") bytes = png({ width: MAX_PNG_DIMENSION + 1 });
      if (problem === "duplicate header") {
        const headerEnd = SIGNATURE.length + LENGTH_BYTES * 2 + IHDR_BYTES + CRC32_BYTES;
        bytes = joinBytes(bytes.subarray(0, headerEnd), bytes.subarray(SIGNATURE.length));
      }
      if (problem === "trailing bytes") bytes = joinBytes(bytes, Uint8Array.of(1));
      const open = vi.fn(() => fakeReader([]));
      const decoder = vi.fn(async () => "unreachable");
      await expect(new BrowserPngAdmission(open).decode(bytes, decoder)).rejects.toThrow();
      expect(open).not.toHaveBeenCalled();
      expect(decoder).not.toHaveBeenCalled();
    },
  );

  it("consumes exact-budget output through EOF and wipes chunks before decoding", async () => {
    const chunks = [Uint8Array.of(4), Uint8Array.of(5)];
    const reader = fakeReader(chunks);
    let compressed!: Uint8Array;
    const admission = new BrowserPngAdmission((bytes) => {
      compressed = bytes;
      expect(bytes).toEqual(COMPRESSED_PIXEL);
      return reader;
    });
    const decoder = vi.fn(async () => {
      expect(chunks.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
      expect(compressed.every((byte) => byte === 0)).toBe(true);
      expect(reader.releaseLock).toHaveBeenCalledOnce();
      return "admitted";
    });
    expect(PngAdmission.read(png()).filteredBytes).toBe(PIXEL_SCANLINE_BYTES);
    await expect(admission.decode(png(), decoder)).resolves.toBe("admitted");
    expect(reader.read).toHaveBeenCalledTimes(chunks.length + 1);
    expect(reader.cancel).not.toHaveBeenCalled();
    expect(decoder).toHaveBeenCalledOnce();
  });

  it("uses the core's Adam7 budget, including empty passes", async () => {
    const bytes = png({ width: 3, height: 3, interlace: 1 });
    // W3C Adam7: the five nonempty passes have 2 + 2 + 3 + 4 + 4 filtered bytes.
    const filtered = new Uint8Array(15).fill(7);
    const reader = fakeReader([filtered]);
    expect(PngAdmission.read(bytes).filteredBytes).toBe(filtered.byteLength);
    const decoder = vi.fn(async () => "admitted interlaced image");
    await expect(new BrowserPngAdmission(() => reader).decode(bytes, decoder)).resolves.toBe(
      "admitted interlaced image",
    );
    expect(filtered.every((byte) => byte === 0)).toBe(true);
    expect(decoder).toHaveBeenCalledOnce();
  });

  it.each([
    { label: "cumulative overflow", chunks: [Uint8Array.of(1), Uint8Array.of(2, 3)] },
    { label: "surplus after the exact budget", chunks: [Uint8Array.of(1, 2), Uint8Array.of(3)] },
    { label: "one oversized chunk", chunks: [Uint8Array.of(1, 2, 3)] },
  ])("cancels $label without reading another chunk", async ({ chunks }) => {
    const unread = Uint8Array.of(9);
    const reader = fakeReader([...chunks, unread]);
    let compressed!: Uint8Array;
    const admission = new BrowserPngAdmission((bytes) => {
      compressed = bytes;
      return reader;
    });
    const decoder = vi.fn(async () => "unreachable");
    await expect(admission.decode(png(), decoder)).rejects.toThrow(INVALID_PNG_INPUT);
    expect(reader.read).toHaveBeenCalledTimes(chunks.length);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(chunks.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
    expect(unread).toEqual(Uint8Array.of(9));
    expect(compressed.every((byte) => byte === 0)).toBe(true);
    expect(decoder).not.toHaveBeenCalled();
  });

  it("rejects a truncated expansion and releases the reader", async () => {
    const output = Uint8Array.of(1);
    const reader = fakeReader([output]);
    const decoder = vi.fn(async () => "unreachable");
    await expect(new BrowserPngAdmission(() => reader).decode(png(), decoder)).rejects.toThrow(
      INVALID_PNG_INPUT,
    );
    expect(output).toEqual(Uint8Array.of(0));
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(decoder).not.toHaveBeenCalled();
  });

  it("redacts stream and cancellation failures while wiping compressed input", async () => {
    const output = Uint8Array.of(1);
    const reader = fakeReader([output], new Error("synthetic private stream detail"));
    reader.cancel.mockRejectedValueOnce(new Error("synthetic private cancellation detail"));
    let compressed!: Uint8Array;
    const admission = new BrowserPngAdmission((bytes) => {
      compressed = bytes;
      return reader;
    });
    const decoder = vi.fn(async () => "unreachable");
    await expect(admission.decode(png(), decoder)).rejects.toThrow(INVALID_PNG_INPUT);
    expect(output).toEqual(Uint8Array.of(0));
    expect(compressed.every((byte) => byte === 0)).toBe(true);
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(decoder).not.toHaveBeenCalled();
  });

  it("wipes compressed input when the bounded stream cannot be opened", async () => {
    let compressed!: Uint8Array;
    const admission = new BrowserPngAdmission((bytes) => {
      compressed = bytes;
      throw new Error("synthetic private startup detail");
    });
    const decoder = vi.fn(async () => "unreachable");
    await expect(admission.decode(png(), decoder)).rejects.toThrow(PNG_BOUNDED_DECODER_UNAVAILABLE);
    expect(compressed.every((byte) => byte === 0)).toBe(true);
    expect(decoder).not.toHaveBeenCalled();
  });

  it("keeps one owned snapshot until the asynchronous decoder settles", async () => {
    const input = png();
    const expected = input.slice();
    const started = gate();
    const finish = gate();
    const reader = fakeReader([Uint8Array.of(0, 0)]);
    let owned!: Uint8Array;
    const decoder = vi.fn(async (bytes: Uint8Array) => {
      owned = bytes;
      expect(owned).toEqual(expected);
      started.resolve();
      await finish.promise;
      expect(owned).toEqual(expected);
      return "decoded";
    });
    const pending = new BrowserPngAdmission(() => reader).decode(input, decoder);
    input.fill(9);
    await started.promise;
    expect(owned.buffer).not.toBe(input.buffer);
    expect(owned).toEqual(expected);
    finish.resolve();
    await expect(pending).resolves.toBe("decoded");
    expect(owned.every((byte) => byte === 0)).toBe(true);
    expect(input.every((byte) => byte === 9)).toBe(true);
  });

  it("wipes the owned snapshot and redacts a decoder rejection", async () => {
    const reader = fakeReader([Uint8Array.of(0, 0)]);
    let owned!: Uint8Array;
    const decoder = vi.fn(async (bytes: Uint8Array) => {
      owned = bytes;
      throw new Error("synthetic private image detail");
    });
    await expect(new BrowserPngAdmission(() => reader).decode(png(), decoder)).rejects.toThrow(
      PNG_IMAGE_DECODE_FAILED,
    );
    expect(owned.every((byte) => byte === 0)).toBe(true);
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
});

describe("QR importer PNG admission boundary", () => {
  it("refuses a corrupt declared PNG before reaching the bitmap or canvas decoder", async () => {
    const bytes = png();
    bytes[bytes.length - 1]! ^= 1;
    const { decode } = fakeImageDecoder();
    const file = new File([bytes], "public-test.png", { type: PNG_MIME_TYPE });
    await expect(importFile(file)).resolves.toEqual({ error: INVALID_PNG_INPUT });
    expect(decode).not.toHaveBeenCalled();
  });

  it.each([PNG_MIME_TYPE, "image/jpeg", "image/webp"])(
    "fails closed for PNG bytes labelled %s when bounded deflate decoding is unavailable",
    async (type) => {
      vi.stubGlobal("DecompressionStream", undefined);
      const { decode } = fakeImageDecoder();
      await expect(importFile(new File([png()], "public-test-image", { type }))).resolves.toEqual({
        error: PNG_BOUNDED_DECODER_UNAVAILABLE,
      });
      expect(decode).not.toHaveBeenCalled();
    },
  );

  it("preserves the non-PNG decoder path without a deflate capability", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    const { decode, bitmap, canvas, pixels } = fakeImageDecoder();
    const bytes = Uint8Array.of(0xff, 0xd8, 0xff, 0xd9);
    const file = new File([bytes], "public-test.jpg", { type: "image/jpeg" });
    vi.spyOn(file, "arrayBuffer").mockResolvedValue(bytes.buffer);
    await expect(importFile(file)).resolves.toEqual({ text: "public synthetic QR result" });
    expect(decode).toHaveBeenCalledExactlyOnceWith(file);
    expect(bytes.every((byte) => byte === 0)).toBe(true);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(pixels.every((byte) => byte === 0)).toBe(true);
  });

  it("refuses stream overflow before reaching the bitmap decoder", async () => {
    const output = Uint8Array.of(1, 2, 3);
    const deflate = fakeDeflate(output);
    const { decode } = fakeImageDecoder();
    const file = new File([png()], "public-test.png", { type: PNG_MIME_TYPE });
    await expect(importFile(file)).resolves.toEqual({ error: INVALID_PNG_INPUT });
    expect(output.every((byte) => byte === 0)).toBe(true);
    expect(deflate.inputChunks.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
    expect(decode).not.toHaveBeenCalled();
  });

  it("closes the bitmap and canvas when PNG drawing fails without exposing decoder errors", async () => {
    fakeDeflate(Uint8Array.of(0, 0));
    const { bitmap, canvas, context } = fakeImageDecoder();
    context.drawImage.mockImplementationOnce(() => {
      throw new Error("synthetic private drawing detail");
    });
    const file = new File([png()], "public-test.png", { type: PNG_MIME_TYPE });
    await expect(importFile(file)).resolves.toEqual({ error: PNG_IMAGE_DECODE_FAILED });
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it("decodes admitted owned PNG bytes and cleans up without creating object URLs", async () => {
    const bytes = png();
    const expected = bytes.slice();
    const file = new File([bytes], "public-test.png", { type: PNG_MIME_TYPE });
    vi.spyOn(file, "arrayBuffer").mockResolvedValue(bytes.buffer);
    const output = Uint8Array.of(0, 0);
    const deflate = fakeDeflate(output);
    const { decode, bitmap, canvas, pixels } = fakeImageDecoder();
    const createUrl = vi.spyOn(URL, "createObjectURL");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL");
    await expect(importFile(file)).resolves.toEqual({ text: "public synthetic QR result" });
    expect(deflate.formats).toEqual(["deflate"]);
    expect(deflate.inputChunks).toHaveLength(1);
    expect(deflate.inputChunks[0]!.every((byte) => byte === 0)).toBe(true);
    expect(output.every((byte) => byte === 0)).toBe(true);
    expect(bytes.every((byte) => byte === 0)).toBe(true);
    const blob = decode.mock.calls[0]![0];
    expect(blob.type).toBe(PNG_MIME_TYPE);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(expected);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
    expect(pixels.every((byte) => byte === 0)).toBe(true);
    expect(createUrl).not.toHaveBeenCalled();
    expect(revokeUrl).not.toHaveBeenCalled();
  });
});
