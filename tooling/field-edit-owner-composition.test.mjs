import { expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";

const disabled = { has: () => false, hasCoin: () => true };
const owner = "packages/crypto-core/src/secret-value.ts";
const consumer = "apps/key-derivation/src/ui/field-edits.ts";

it("admits the generic comparison owner from the core without MnemoCode's features", () => {
  expect(() => assertKeyDerivationComposition(disabled, [consumer, owner])).not.toThrow();
  expect(() => assertKeyDerivationComposition(disabled, [owner])).not.toThrow();
  expect(() =>
    assertKeyDerivationComposition(disabled, [
      consumer,
      owner,
      "packages/recovery-backup/src/mnemocode-facts.ts",
    ]),
  ).toThrow("mnemocode is excluded");
});
