import { describe, expect, it, vi } from "vitest";
import { MnemoCodeCardFiles } from "../src/mnemocode-card-files.js";

describe("MnemoCode card file ownership without rendering", () => {
  it("clears an owned PDF when image conversion is unavailable", async () => {
    const pdf = Uint8Array.of(7);
    await expect(new MnemoCodeCardFiles().single(pdf, "png")).rejects.toThrow(
      "Image export is unavailable",
    );
    expect(pdf).toEqual(Uint8Array.of(0));
  });

  it("clears every refused page and the source PDF", async () => {
    const pdf = Uint8Array.of(7);
    const pages = [Uint8Array.of(1), Uint8Array.of(2)];
    const files = new MnemoCodeCardFiles(async () => pages);
    await expect(files.single(pdf, "png")).rejects.toThrow("exactly one page");
    expect([pdf, ...pages].every((bytes) => bytes[0] === 0)).toBe(true);
  });

  it("clears previous outputs and unprocessed PDFs after a later conversion fails", async () => {
    const image = Uint8Array.of(9);
    const failure = new Error("Synthetic image refusal.");
    const rasterize = vi.fn().mockResolvedValueOnce([image]).mockRejectedValueOnce(failure);
    const cards = [1, 2, 3].map((value) => ({
      name: `card-${value}`,
      bytes: Uint8Array.of(value),
    }));
    await expect(new MnemoCodeCardFiles(rasterize).entries(cards, "png")).rejects.toBe(failure);
    expect(cards.every(({ bytes }) => bytes[0] === 0)).toBe(true);
    expect(image).toEqual(Uint8Array.of(0));
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it("retains successful image bytes for the caller while clearing the converted PDF", async () => {
    const pdf = Uint8Array.of(7);
    const image = Uint8Array.of(8);
    const result = await new MnemoCodeCardFiles(async () => [image]).single(pdf, "png");
    expect(result).toBe(image);
    expect(image).toEqual(Uint8Array.of(8));
    expect(pdf).toEqual(Uint8Array.of(0));
  });

  it("refuses unsafe archive components and clears the admitted output set", async () => {
    const bytes = Uint8Array.of(7);
    await expect(
      new MnemoCodeCardFiles().entries([{ name: "../private", bytes }], "pdf"),
    ).rejects.toThrow("one safe path component");
    expect(bytes).toEqual(Uint8Array.of(0));
  });
});
