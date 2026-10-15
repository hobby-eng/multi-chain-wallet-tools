import { describe, expect, it, vi } from "vitest";
import { MnemoCodeDisclosure } from "../src/mnemocode-disclosure.js";
import { encodeMnemoCode, parseMnemoCodeDates } from "../src/mnemocode.js";
import { EncodedBackup } from "../../recovery-mnemocode/source/core/encoded-backup.js";

const ORIGINAL =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const MASKED = "wool abuse actual wool abuse actual wool abuse actual wool abuse congress";

describe("Original and masked copy choices", () => {
  it("does not compute or expose any original copy by default", () => {
    const encode = vi.spyOn(EncodedBackup, "encode");
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

  it("uses the library's direct representation for original codes regardless of masking", () => {
    const encode = vi.spyOn(EncodedBackup, "encode");
    const rows = MnemoCodeDisclosure.original(ORIGINAL, "indexes", "codes");
    expect(rows[0]?.text).toBe("1 1 1 1 1 1 1 1 1 1 1 4");
    expect(encode).toHaveBeenCalledExactlyOnceWith(ORIGINAL, [], "indexes", "direct");
    encode.mockRestore();
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
    const result = encodeMnemoCode(
      ORIGINAL,
      "seedshift",
      "colors",
      parseMnemoCodeDates("23-09-2026"),
    );
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
