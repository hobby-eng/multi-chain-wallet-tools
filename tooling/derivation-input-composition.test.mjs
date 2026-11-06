import { expect, it } from "vitest";
import { assertDashOnlyGraph } from "./build-profiles.mjs";

it("admits only the exact coin-neutral derivation input library in Dash", () => {
  const source = "packages/coin-protocols/src/coins/derivation-input.ts";
  expect(() => assertDashOnlyGraph([source], "Derivation input")).not.toThrow();
  expect(() => assertDashOnlyGraph([`${source}.backup`], "Derivation input")).toThrow();
});
