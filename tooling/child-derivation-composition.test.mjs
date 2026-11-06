import { expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";

it("excludes the child derivation owner when BIP85 is absent", () => {
  expect(() =>
    assertKeyDerivationComposition({ has: () => false, hasCoin: () => true }, [
      "apps/key-derivation/src/ui/bip85-child-derivation.ts",
    ]),
  ).toThrow("bip85 is excluded");
});
