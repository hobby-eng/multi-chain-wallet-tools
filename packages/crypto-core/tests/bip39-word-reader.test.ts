import { expect, it } from "vitest";
import { Bip39WordReader } from "../src/bip39-word-reader.js";

it("reads published index boundaries and bounds diagnostic suggestions", () => {
  const reader = new Bip39WordReader();
  expect(reader.at(0)).toBe("abandon");
  expect(reader.at(2047)).toBe("zoo");
  for (const index of [-1, 2048, 0.5, Number.NaN])
    expect(() => reader.at(index)).toThrow(expect.objectContaining({ code: "bip39.word.missing" }));
  expect(reader.suggestions("abandno")).toContain(0);
  expect(reader.suggestions("x".repeat(reader.maximumWordUnits + 3))).toEqual([]);
});

it.each(["aba", "notaword", "zoo,", "zoo zoo"])(
  "refuses an unknown English word with a stable code",
  (value) => {
    const reader = new Bip39WordReader();
    expect(() => reader.index(value)).toThrow(
      expect.objectContaining({ code: "bip39.word.unknown" }),
    );
    expect(() => reader.word(value)).toThrow(
      expect.objectContaining({ code: "bip39.word.unknown" }),
    );
  },
);

it("keeps the published first and last English words and their unique prefixes", () => {
  const reader = new Bip39WordReader();
  expect(reader.index("abandon")).toBe(0);
  expect(reader.index(" Zoo ")).toBe(2047);
  expect(reader.word("Aban")).toBe("abandon");
});

it.each([
  ["", 0],
  [" \t\n\uFEFF", 0],
  ["  abandon\tzoo\n", 2],
  ["unknown", 1],
])("counts lexical words without claiming validity", (value, count) => {
  expect(new Bip39WordReader().wordCount(value)).toBe(count);
});

it("refuses non-text before normalization and never coerces an object", () => {
  const reader = new Bip39WordReader();
  const value = {
    toString(): never {
      throw new Error("No coercion of outside input");
    },
  };
  for (const input of [undefined, null, 0, value]) {
    expect(reader.accepts(input)).toBe(false);
    expect(() => reader.index(input)).toThrow(expect.objectContaining({ code: "bip39.word.text" }));
    expect(() => reader.wordCount(input)).toThrow(
      expect.objectContaining({ code: "bip39.word.text" }),
    );
  }
});
