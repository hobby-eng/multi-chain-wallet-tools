import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertKeyDerivationComposition,
  createKeyDerivationCompositionPlugin,
} from "./key-derivation-composition.mjs";

const options = (coins, features = []) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => features.includes(feature),
});

describe("TON's check in the wallet-check draw", () => {
  it("brings TON's check into the wallet-check draw with TON alone", () => {
    const precheck = (coins) => {
      const hooks = [];
      createKeyDerivationCompositionPlugin("/workspace", options(coins, ["mhfe"])).setup({
        onResolve: (filter, callback) => hooks.push([filter.filter, callback]),
        onLoad() {},
      });
      const hook = hooks.find(([filter]) => filter.test("./ton-draw-precheck.js"));
      return hook?.[1]({ path: "./ton-draw-precheck.js" }).path;
    };
    // Without TON, the draw's worker imports a stand-in that carries no TON code.
    expect(precheck(["dash"])).toBe(
      resolve("/workspace", "apps/key-derivation/src/workers/no-ton-draw-precheck.ts"),
    );
    expect(precheck(["bitcoin", "ton"])).toBeUndefined();
    expect(() =>
      assertKeyDerivationComposition(options(["dash"], ["mhfe"]), [
        "apps/key-derivation/src/workers/ton-draw-precheck.ts",
      ]),
    ).toThrow(/excluded/u);
  });
});
