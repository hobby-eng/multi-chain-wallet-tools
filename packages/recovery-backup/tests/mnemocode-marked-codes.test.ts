import { beforeAll, expect, it, vi } from "vitest";
import { loadMnemoCode } from "../src/mnemocode-module.js";
import { MnemoCodeMarkedCodes } from "../src/mnemocode-marked-codes.js";
import {
  ENCODED_FORMATS,
  encodeMnemoCode,
  MNEMOCODE_PHRASE_WORD_COUNTS,
  type MnemoCodeFormat,
} from "../src/mnemocode.js";
import { EncodedForm } from "../src/mnemocode-facts.js";

// Public BIP39 test phrase and MnemoCode's published date example only.
const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const DATES = "23-09-2026";
const WORDS = MNEMOCODE_PHRASE_WORD_COUNTS[0]!;

beforeAll(async () => {
  await loadMnemoCode();
});

/** The codes of the public phrase in `format`, masked, the last one marked with ?. */
function codesOf(format: MnemoCodeFormat): string {
  return encodeMnemoCode(PHRASE, "seedshift", format, DATES).payload;
}

function marked(format: MnemoCodeFormat): string {
  const text = codesOf(format);
  const units = EncodedForm.of(format).apartCodes(text) ?? text.split(" ");
  units[units.length - 1] = "?";
  return units.join(" ");
}

it.each(ENCODED_FORMATS.filter((format) => format !== "colors-unicode"))(
  "owns %s marked text and releases it without changing public metadata",
  (format) => {
    const text = marked(format);
    const codes = MnemoCodeMarkedCodes.read(text, format, "seedshift", WORDS);
    expect(codes).toBeDefined();
    expect(codes!.text).toBe(text);
    expect(codes!.format).toBe(format);
    expect(codes!.words).toBe(WORDS);
    expect(codes!.ways.some(({ way }) => way === "wallet")).toBe(true);
    const ways = codes!.ways;
    codes!.wipe();
    expect(() => codes!.text).toThrow(expect.objectContaining({ code: "core.secret-value.wiped" }));
    expect(codes!.ways).toBe(ways);
    expect(codes!.format).toBe(format);
    codes![Symbol.dispose]();
  },
);

it("offers no search for unmarked text and refuses ambiguous marked representations", () => {
  expect(MnemoCodeMarkedCodes.read(codesOf("english"), "english", "seedshift")).toBeUndefined();
  expect(() => MnemoCodeMarkedCodes.read("? ".repeat(WORDS), "auto", "direct")).toThrow(
    expect.objectContaining({ code: "wallet.mnemocode-marked-codes.ambiguous" }),
  );
});

it("accepts only offered ways and makes their metadata immutable", () => {
  using codes = MnemoCodeMarkedCodes.read(marked("english"), "english", "seedshift", WORDS);
  expect(codes!.way("wallet")).toBe("wallet");
  expect(codes!.way("synthetic-unknown-way")).toBeUndefined();
  expect(codes!.way({ way: "wallet" })).toBeUndefined();
  expect(Object.isFrozen(codes!.ways)).toBe(true);
  expect(codes!.ways.every(Object.isFrozen)).toBe(true);
});

it("keeps the declared length when printed decoy codes follow the backup", () => {
  const text = `${marked("english")} ${codesOf("english")}`;
  using codes = MnemoCodeMarkedCodes.read(text, "english", "seedshift", WORDS);
  expect(codes!.words).toBe(WORDS);
  expect(codes!.unreadable).toMatch(/12|candidates/u);
});

it("refuses oversized raw text before a native encoder allocates a copy", () => {
  const encode = vi.spyOn(TextEncoder.prototype, "encode");
  try {
    expect(() => MnemoCodeMarkedCodes.read("x".repeat(65_537), "auto", "direct")).toThrow(
      expect.objectContaining({ code: "wallet.mnemocode-input.too-large" }),
    );
    expect(encode.mock.calls.length).toBe(0);
  } finally {
    encode.mockRestore();
  }
});

it("takes a record's representation and masking mode ahead of the page selection", () => {
  using codes = MnemoCodeMarkedCodes.read(
    `MNC1:seedshift:english:${marked("english")}`,
    "indexes",
    "direct",
    WORDS,
  );
  expect(codes!.format).toBe("english");
  expect(codes!.mode).toBe("seedshift");
  expect(codes!.needsDates).toBe(true);
});

it("refuses a selected incompatible representation through the parser", () => {
  expect(() => MnemoCodeMarkedCodes.read(marked("english"), "indexes", "seedshift")).toThrow();
});
