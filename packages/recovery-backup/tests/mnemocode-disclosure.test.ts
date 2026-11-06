import { beforeAll, describe, expect, it, vi } from "vitest";
import { MnemoCodeDisclosure } from "../src/mnemocode-disclosure.js";
import { mnemocode } from "../src/mnemocode-engine.js";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import { encodeMnemoCode } from "../src/mnemocode.js";

beforeAll(async () => {
  await loadMnemoCode();
});

const ORIGINAL =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const MASKED = "wool abuse actual wool abuse actual wool abuse actual wool abuse congress";

describe("Original and masked copy choices", () => {
  it("does not compute or expose any original copy by default", () => {
    const encode = vi.spyOn(mnemocode().EncodedBackup, "encode");
    expect(MnemoCodeDisclosure.original(ORIGINAL, "colors", "none")).toEqual([]);
    expect(encode).not.toHaveBeenCalled();
    encode.mockRestore();
    expect(MnemoCodeDisclosure.masked(MASKED, "seedshift", false)).toEqual([]);
  });

  it("distinguishes original words from the after-Seedshift words", () => {
    expect(MnemoCodeDisclosure.original(ORIGINAL, "colors", "words")[0]).toMatchObject({
      role: "original",
      text: ORIGINAL,
    });
    expect(MnemoCodeDisclosure.masked(MASKED, "seedshift", true)[0]).toMatchObject({
      role: "masked",
      text: MASKED,
    });
    expect(MnemoCodeDisclosure.original(ORIGINAL, "colors", "words")[0]?.note).toContain(
      "no shares or Seedshift dates",
    );
    expect(MnemoCodeDisclosure.masked(MASKED, "seedshift", true)[0]?.note).toContain("same dates");
  });

  it("writes the original codes without Seedshift, word numbers from the word table", () => {
    expect(MnemoCodeDisclosure.original(ORIGINAL, "indexes", "codes")[0]?.text).toBe(
      "1 1 1 1 1 1 1 1 1 1 1 4",
    );
    expect(MnemoCodeDisclosure.original(ORIGINAL, "unicode", "codes")[0]?.text).toBe(
      "768476847684768476847684768476847684768476845728",
    );
  });

  it("shows words plus distinct codes, but only one English original when both were requested", () => {
    expect(MnemoCodeDisclosure.original(ORIGINAL, "indexes", "both")).toHaveLength(2);
    expect(MnemoCodeDisclosure.original(ORIGINAL, "english", "both")).toHaveLength(1);
    expect(MnemoCodeDisclosure.masked(MASKED, "seedshift", true, MASKED)).toEqual([]);
  });

  it("does not call a Direct phrase after-Seedshift words", () => {
    expect(MnemoCodeDisclosure.masked(ORIGINAL, "direct", true)).toEqual([]);
  });

  it("provides exact library shifted words independently of the selected code format", () => {
    const result = encodeMnemoCode(ORIGINAL, "seedshift", "colors", "23-09-2026");
    expect(result.shiftedEnglish).toBe(MASKED);
    expect(MnemoCodeDisclosure.masked(result.shiftedEnglish, result.mode, true)[0]?.text).toBe(
      MASKED,
    );
  });

  it("refuses an unknown display selector without coercion or supplied text", () => {
    const toString = vi.fn(() => "synthetic-private-value");
    expect(() => MnemoCodeDisclosure.originalChoice({ toString })).toThrow("Select how to show");
    expect(toString).not.toHaveBeenCalled();
    expect(() => MnemoCodeDisclosure.originalChoice("synthetic-private-value")).toThrow(
      "Select how to show",
    );
  });
});
