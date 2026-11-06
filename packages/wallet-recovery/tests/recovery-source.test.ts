import { expect, it } from "vitest";
import { RecoverySourceRoute, RecoverySourceRouteError } from "../src/recovery-source.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// Independent public operation inventory: a missing/renamed destination must update this contract.
it.each([
  "matcher",
  "seedqr",
  "mnemocode",
  "mhfe",
  "slip39",
  "codex32",
  "sskr",
  "gordian-envelope",
])("admits the %s workflow without reading private inputs during route admission", (target) => {
  expect(new RecoverySourceRoute("main", target).target).toBe(target);
  expect(new RecoverySourceRoute("bip85", target).target).toBe(target);
});

it("refuses coercible native choices without executing their string conversion", () => {
  let conversions = 0;
  const outside = {
    toString() {
      conversions += 1;
      return "main";
    },
  };
  expect(() => new RecoverySourceRoute(outside, "seedqr")).toThrow(
    expect.objectContaining({ code: "recovery.source.kind" }),
  );
  expect(() => new RecoverySourceRoute("main", outside)).toThrow(
    expect.objectContaining({ code: "recovery.source.target" }),
  );
  expect(conversions).toBe(0);
});

it("retains a provider's receiver and does not ask for the unselected source", () => {
  const reference = {
    label: "Synthetic original",
    read: () => ({ mnemonic: PHRASE, passphrase: "" }),
  };
  const providers = {
    originalReference() {
      expect(this).toBe(providers);
      return reference;
    },
    childReference() {
      throw new Error("The unselected child source must never be read.");
    },
  };
  expect(new RecoverySourceRoute("main", "seedqr").resolve(providers)).toBe(reference);
});

it.each(["expired", "native-failure"])("redacts an original %s as one stable refusal", (kind) => {
  const reference = {
    label: "Synthetic original",
    read() {
      if (kind === "native-failure") throw new Error("synthetic private native detail");
      return null;
    },
  };
  let refused: unknown;
  try {
    new RecoverySourceRoute("main", "seedqr").resolve({
      originalReference: () => reference,
      childReference: () => null,
    });
  } catch (cause) {
    refused = cause;
  }
  expect(refused).toBeInstanceOf(RecoverySourceRouteError);
  expect(refused).toHaveProperty("code", "recovery.source.original-phrase");
  expect(String(refused)).not.toContain("synthetic private native detail");
});
