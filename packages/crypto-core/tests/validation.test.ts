import { describe, expect, it } from "vitest";
import { parseConcurrency, parseInteger } from "../src/validation.js";

describe("shared numeric validation", () => {
  it("accepts bounded values and rejects unsafe/negative values", () => {
    expect(parseInteger("0", "Account")).toBe(0);
    expect(parseInteger("4", "Account", 1)).toBe(4);
    expect(parseConcurrency("5")).toBe(5);
    expect(() => parseInteger("-1", "Account")).toThrow(/at least 0/iu);
    expect(() => parseInteger("1.5", "Account")).toThrow(/whole number/iu);
    expect(() => parseConcurrency("0")).toThrow(/1 to 5/iu);
    expect(() => parseConcurrency("6")).toThrow(/1 to 5/iu);
  });
});

it.each(["", " ", "\t\n"])("refuses missing numeric text %j instead of zero", (value) => {
  expect(() => parseInteger(value, "Account")).toThrow();
});

it.each(["0x10", "0b10", "0o10"])("refuses a non-decimal integer encoding %s", (value) => {
  expect(() => parseInteger(value, "Account")).toThrow();
});

it.each([
  ["1.0", 1],
  ["1e3", 1000],
  ["001", 1],
  [" +1 ", 1],
] as const)("keeps decimal native notation %s", (value, expected) => {
  expect(parseInteger(value, "Count")).toBe(expected);
});

it("bounds raw numeric text before conversion", () => {
  expect(parseInteger("0".repeat(64), "Count")).toBe(0);
  expect(() => parseInteger("0".repeat(65), "Count")).toThrow(
    expect.objectContaining({ code: "input.integer.text-size" }),
  );
});

it.each([NaN, Infinity, -1])("refuses an invalid upper bound %s", (maximum) => {
  expect(() => parseInteger("0", "Count", 0, maximum)).toThrow(
    expect.objectContaining({ code: "input.integer.invalid" }),
  );
});
