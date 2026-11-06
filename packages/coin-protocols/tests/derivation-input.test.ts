import { expect, it } from "vitest";
import { getCoinAdapter } from "../src/coins/registry.js";
import { DerivationInput } from "../src/coins/derivation-input.js";

const FIELDS = {
  network: "mainnet",
  account: "7",
  branch: "0",
  start: "2",
  count: "3",
  includeChange: true,
  includeCoinJoin: false,
};

it("uses the selected profile's own account, branch and range rules", () => {
  const input = DerivationInput.fromFields(getCoinAdapter("dash-legacy-mobile"), FIELDS);
  expect(input).toEqual({
    network: "mainnet",
    account: 7,
    branch: 0,
    start: 2,
    count: 3,
    includeChange: true,
    includeCoinJoin: false,
  });
  expect(getCoinAdapter("dash-legacy-mobile").pathPreview(input)).toBe("m/7'/0/2…4");
});

it("does not read irrelevant branch text for paired address profiles", () => {
  expect(
    DerivationInput.fromFields(getCoinAdapter("bitcoin-taproot"), {
      ...FIELDS,
      get branch() {
        throw new Error("An unused branch must not be read.");
      },
    }).branch,
  ).toBe(0);
});

it("refuses a forged option missing from a profile's branch menu", () => {
  const base = getCoinAdapter("ethereum");
  const adapter = {
    ...base,
    branchControl: {
      label: "Branch",
      max: 2,
      options: [
        { value: 0, label: "Zero" },
        { value: 2, label: "Two" },
      ],
    },
  };
  expect(() => DerivationInput.fromFields(adapter, { ...FIELDS, branch: "1" })).toThrow(
    expect.objectContaining({ code: "derivation.input.branch" }),
  );
});

it("checks a range ending at the exact protocol maximum", () => {
  const adapter = {
    ...getCoinAdapter("bitcoin-taproot"),
    limits: { startMax: 999, accountMax: 7 },
  };
  expect(DerivationInput.fromFields(adapter, { ...FIELDS, start: "998", count: "2" }).count).toBe(
    2,
  );
  expect(() =>
    DerivationInput.fromFields(adapter, { ...FIELDS, start: "998", count: "3" }),
  ).toThrow(expect.objectContaining({ code: "derivation.input.range" }));
  expect(() => DerivationInput.fromFields(adapter, { ...FIELDS, account: "8" })).toThrow(
    expect.objectContaining({ code: "input.integer.invalid" }),
  );
});
