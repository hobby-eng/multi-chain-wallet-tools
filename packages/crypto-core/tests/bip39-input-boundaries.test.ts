import { afterEach, expect, it, vi } from "vitest";
import { assertValidMnemonic, diagnoseMnemonic } from "../src/bip39.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
// Independent policy boundaries: raw UTF-16 units and twice the maximum BIP39 word count.
const RAW_LIMIT = 8192;
const DIAGNOSTIC_WORD_LIMIT = 48;

afterEach(() => vi.restoreAllMocks());

it("admits the raw text boundary without truncation and refuses Unicode expansion beyond it", () => {
  const boundary = PHRASE.padStart(RAW_LIMIT, " ");
  expect(assertValidMnemonic(boundary)).toBe(PHRASE);
  using report = diagnoseMnemonic(boundary);
  expect(report.checksumValid).toBe(true);
  // U+FDFA has an NFKD expansion; raw admission alone cannot bound its normalized text.
  expect(() => assertValidMnemonic("\uFDFA".repeat(RAW_LIMIT))).toThrow(
    expect.objectContaining({ code: "bip39.input.text-size" }),
  );
});

it("admits the diagnostic word-count boundary as malformed input without claiming BIP39 validity", () => {
  using report = diagnoseMnemonic("abandon ".repeat(DIAGNOSTIC_WORD_LIMIT));
  expect(report.wordCount).toBe(DIAGNOSTIC_WORD_LIMIT);
  expect(report.wordCountValid).toBe(false);
  expect(report.allWordsKnown).toBe(true);
  expect(report.checksumValid).toBe(false);
});

it.each([assertValidMnemonic, diagnoseMnemonic])(
  "refuses oversized raw phrase text before Unicode normalization",
  (inspect) => {
    const raw = " ".repeat(RAW_LIMIT + 1) + PHRASE;
    const nativeNormalize: unknown = Object.getOwnPropertyDescriptor(
      String.prototype,
      "normalize",
    )?.value;
    if (typeof nativeNormalize !== "function")
      throw new Error("Native Unicode normalization is required.");
    let oversizedNormalizations = 0;
    vi.spyOn(String.prototype, "normalize").mockImplementation(function (this: string, form) {
      if (String(this) === raw) oversizedNormalizations += 1;
      const normalized: unknown = Reflect.apply(nativeNormalize, this, [form]);
      if (typeof normalized !== "string") throw new Error("Native normalization must return text.");
      return normalized;
    });
    let refusal: unknown;
    try {
      inspect(raw);
    } catch (cause) {
      refusal = cause;
    }
    expect(refusal).toHaveProperty("code", "bip39.input.text-size");
    expect(oversizedNormalizations).toBe(0);
  },
);

it("refuses excessive diagnostic word counts before building per-word reports", () => {
  expect(() => diagnoseMnemonic("abandon ".repeat(DIAGNOSTIC_WORD_LIMIT + 1))).toThrow(
    expect.objectContaining({ code: "bip39.input.diagnostic-count" }),
  );
});

it("refuses a non-string JavaScript input without coercion or native exception text", () => {
  let conversions = 0;
  const outside = {
    toString() {
      conversions += 1;
      return PHRASE;
    },
  };
  expect(() => {
    Reflect.apply(assertValidMnemonic, undefined, [outside]);
  }).toThrow(expect.objectContaining({ code: "bip39.input.text" }));
  expect(conversions).toBe(0);
});
