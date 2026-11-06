import { expect, it } from "vitest";
import {
  SilentPaymentError,
  SilentPaymentParameters,
} from "../src/coins/bitcoin/silent-payment-parameters.js";
import { SilentPaymentWallet } from "../src/coins/bitcoin/silent-payments.js";

it("admits the full nonzero uint32 label range and owns a sorted unique snapshot", () => {
  const input = [4_294_967_295, 2, 1, 2];
  const parameters = new SilentPaymentParameters("testnet", 2_147_483_647, input);
  input.fill(0);
  expect(parameters.network).toBe("testnet");
  expect(parameters.account).toBe(2_147_483_647);
  expect(parameters.labels).toEqual([1, 2, 4_294_967_295]);
  expect(Object.isFrozen(parameters.labels)).toBe(true);
});

it.each([0, -1, 4_294_967_296, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "1", null])(
  "refuses the out-of-domain label %s with a stable code",
  (label) => {
    expect(() => new SilentPaymentParameters("mainnet", 0, [label])).toThrow(
      expect.objectContaining({ code: "silent-payment.labels" }),
    );
  },
);

it.each([-1, 2_147_483_648, 1.5, Number.NaN, "0", undefined])(
  "refuses the out-of-domain account %s",
  (account) => {
    expect(() => new SilentPaymentParameters("mainnet", account)).toThrow(
      expect.objectContaining({ code: "silent-payment.account" }),
    );
  },
);

it("checks raw label count before deduplication in both native and text requests", () => {
  expect(new SilentPaymentParameters("mainnet", 0, Array<number>(200).fill(1)).labels).toEqual([1]);
  expect(() => new SilentPaymentParameters("mainnet", 0, Array<number>(201).fill(1))).toThrow(
    expect.objectContaining({ code: "silent-payment.label-count" }),
  );
  expect(() =>
    SilentPaymentParameters.fromFields("mainnet", "0", Array<string>(201).fill("1").join(",")),
  ).toThrow(expect.objectContaining({ code: "silent-payment.label-count" }));
});

it("bounds raw text before splitting and refuses blank account or unknown network", () => {
  expect(() => SilentPaymentParameters.fromFields("mainnet", "0", " ".repeat(65_537))).toThrow(
    expect.objectContaining({ code: "silent-payment.label-text" }),
  );
  expect(() => SilentPaymentParameters.fromFields("mainnet", "", "")).toThrow(
    expect.objectContaining({ code: "silent-payment.account" }),
  );
  expect(() => SilentPaymentParameters.fromFields("synthetic-unknown", "0", "")).toThrow(
    expect.objectContaining({ code: "silent-payment.network" }),
  );
  expect(SilentPaymentParameters.fromFields("mainnet", "0", "3, 1,, 2,1").labels).toEqual([
    1, 2, 3,
  ]);
});

it("recognizes transported codes and does not inspect arbitrary non-errors", () => {
  const error = Object.assign(new Error("Public coded refusal"), { code: "silent-payment.labels" });
  expect(SilentPaymentError.codeOf(error)).toBe("silent-payment.labels");
  expect(SilentPaymentError.codeOf({ code: "silent-payment.labels" })).toBeUndefined();
  expect(SilentPaymentError.codeOf(new Error("silent-payment.labels"))).toBeUndefined();
});

it("refuses malformed public parameters before reading a borrowed seed", async () => {
  const bytes = new Uint8Array();
  // An empty seed cannot derive a root; parameter refusal must be the first failure.
  await expect(SilentPaymentWallet.derive(bytes, "mainnet", 2_147_483_648)).rejects.toMatchObject({
    code: "silent-payment.account",
  });
  await expect(SilentPaymentWallet.derive(bytes, "mainnet", 0, [0])).rejects.toMatchObject({
    code: "silent-payment.labels",
  });
  expect(bytes).toHaveLength(0);
});
