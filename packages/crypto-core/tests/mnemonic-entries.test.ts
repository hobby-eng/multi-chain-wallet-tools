import { describe, expect, it, vi } from "vitest";
import { MnemonicEntries } from "../src/mnemonic-entries.js";

const PHRASE = "forum undo fragile fade shy sign arrest garment culture tube off merit";

describe("bounded mnemonic lists", () => {
  it("admits the documented raw-text boundary without truncating its phrase", () => {
    expect(MnemonicEntries.maximumEntries).toBe(100);
    expect(MnemonicEntries.maximumTextUnits).toBe(65_536);
    const text = " ".repeat(65_536 - PHRASE.length) + PHRASE;
    expect(MnemonicEntries.parse(text)).toEqual([PHRASE]);
  });

  it("refuses overlong raw text before any native Unicode normalization", () => {
    const normalize = vi.spyOn(String.prototype, "normalize");
    try {
      expect(() => MnemonicEntries.parse("public-oversize-marker" + "x".repeat(65_536))).toThrow(
        expect.objectContaining({ code: "mnemonic.entries.text-size" }),
      );
      expect(normalize).not.toHaveBeenCalled();
    } finally {
      normalize.mockRestore();
    }
  });

  it("admits 100 explicit phrases and refuses the next before normalization", () => {
    expect(
      MnemonicEntries.parse(Array.from({ length: 100 }, () => PHRASE).join("\n")),
    ).toHaveLength(100);
    const normalize = vi.spyOn(String.prototype, "normalize");
    try {
      expect(() =>
        MnemonicEntries.parse(Array.from({ length: 101 }, () => PHRASE).join("\n")),
      ).toThrow(expect.objectContaining({ code: "mnemonic.entries.count" }));
      expect(normalize).not.toHaveBeenCalled();
    } finally {
      normalize.mockRestore();
    }
  });

  it("bounds inferred entries as well as explicit lines", () => {
    expect(() =>
      MnemonicEntries.parse(Array.from({ length: 101 }, () => PHRASE).join(" ")),
    ).toThrow(expect.objectContaining({ code: "mnemonic.entries.count" }));
  });

  it("refuses an excessive word count before native Unicode normalization", () => {
    const normalize = vi.spyOn(String.prototype, "normalize");
    try {
      expect(() => MnemonicEntries.parse("abandon ".repeat(2401))).toThrow(
        expect.objectContaining({ code: "mnemonic.entries.words" }),
      );
      expect(normalize).not.toHaveBeenCalled();
    } finally {
      normalize.mockRestore();
    }
  });

  it.each([null, undefined, 7, {}, [PHRASE]])(
    "refuses non-text input without coercing it: %j",
    (input) => {
      expect(() => MnemonicEntries.parse(input)).toThrow(
        expect.objectContaining({ code: "mnemonic.entries.type" }),
      );
    },
  );
});
