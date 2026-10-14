import { describe, expect, it } from "vitest";
import { AtomicAmount } from "../src/atomic-amount.js";

describe("exact atomic amounts", () => {
  it.each([
    [0n, 0, "0"],
    [12n, 0, "12"],
    [1n, 8, "0.00000001"],
    [-1n, 18, "-0.000000000000000001"],
    [1_234_000_001n, 8, "12.34000001"],
    [123_450_000_000n, 11, "1.2345"],
    [90_071_992_547_409_931_234_567_890n, 18, "90071992.54740993123456789"],
  ] as const)("formats %s at scale %s", (value, decimals, expected) => {
    expect(AtomicAmount.format(value, decimals)).toBe(expected);
  });

  it("preserves positive-sign and UI minus/grouping choices", () => {
    expect(AtomicAmount.format(0n, 8, { signed: true })).toBe("0");
    expect(AtomicAmount.format(1n, 8, { signed: true })).toBe("+0.00000001");
    expect(
      AtomicAmount.format(-123_450n, 2, {
        negativeSign: "−",
        whole: (whole) => whole.toLocaleString("en-US"),
      }),
    ).toBe("−1,234.5");
  });

  it("parses exact signed decimal text and refuses precision loss", () => {
    expect(AtomicAmount.parseDecimal("12.34000001", 8)).toBe(1_234_000_001n);
    expect(AtomicAmount.parseDecimal("-0.00000001", 8)).toBe(-1n);
    expect(AtomicAmount.parseDecimal("1.", 0)).toBe(1n);
    for (const text of ["1e3", "+1", "NaN", "1.000000001", " 1 "])
      expect(AtomicAmount.parseDecimal(text, 8)).toBeNull();
    for (const decimals of [-1, 1.5, NaN, Infinity, 31])
      expect(() => AtomicAmount.format(1n, decimals)).toThrow(/decimals/u);
  });
});
