import { afterEach, describe, expect, it, vi } from "vitest";
import * as downloads from "@ckd/export/download.js";
import { MnemoCodeDownload } from "../src/ui/recovery-mnemocode-download.js";

describe("MnemoCode browser download admission without a browser", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["../private.txt", "CON", "unsafe\n.txt"])(
    "refuses the unsafe filename %s before any save",
    (name) => {
      const save = vi.spyOn(downloads, "downloadBlob").mockImplementation(() => undefined);
      expect(() => MnemoCodeDownload.bytes(Uint8Array.of(7), "text/plain", name)).toThrow(
        "one safe path component",
      );
      expect(save).not.toHaveBeenCalled();
    },
  );

  it("does not coerce a filename or pass it to the text export", () => {
    const toString = vi.fn(() => "synthetic-private-name");
    const host = { downloadText: vi.fn() };
    expect(() => MnemoCodeDownload.text(host, "synthetic", { toString }, "text/plain")).toThrow();
    expect(toString).not.toHaveBeenCalled();
    expect(host.downloadText).not.toHaveBeenCalled();
  });

  it("copies bytes into the saved Blob while preserving borrowed input on a refusal", async () => {
    const source = Uint8Array.of(1, 2, 3);
    let captured: Blob | undefined;
    const failure = new Error("Synthetic save refusal.");
    vi.spyOn(downloads, "downloadBlob").mockImplementation((blob) => {
      captured = blob;
      throw failure;
    });
    expect(() => MnemoCodeDownload.bytes(source, "text/plain", "test.txt")).toThrow(failure);
    expect(source).toEqual(Uint8Array.of(1, 2, 3));
    if (captured === undefined) throw new Error("The synthetic save was not reached.");
    expect(new Uint8Array(await captured.arrayBuffer())).toEqual(source);
  });
});
