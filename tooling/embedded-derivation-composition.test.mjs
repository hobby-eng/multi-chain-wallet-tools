import { expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";
import { assertDashOnlyGraph } from "./build-profiles.mjs";
const source = "packages/coin-protocols/src/coins/embedded-derivation.ts";

it("excludes embedded child-wallet admission when BIP85 is absent", () => {
  expect(() =>
    assertKeyDerivationComposition({ has: () => false, hasCoin: () => true }, [source]),
  ).toThrow("bip85 is excluded");
});
it("admits only the exact coin-neutral embedded-wallet rule in Dash", () => {
  expect(() => assertDashOnlyGraph([source], "Embedded child wallet")).not.toThrow();
  expect(() => assertDashOnlyGraph([`${source}.backup`], "Embedded child wallet")).toThrow();
});
