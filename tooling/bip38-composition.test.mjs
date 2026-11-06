import { describe, expect, it } from "vitest";
import { assertPsbtComposition } from "./psbt-inspector-composition.mjs";
const options = (enabled) => ({
  has: (feature) => enabled && feature === "bip38-decrypt",
  hasCoin: () => true,
});
const inputs = [
  "bip38-feature",
  "bip38-decryptor",
  "bip38-input",
  "bip38-batch",
  "bip38-results",
].map((name) => `apps/psbt-inspector/src/${name}.ts`);

describe("Inspector BIP38 composition", () => {
  it("requires every real input, batch and result owner in an enabled feature", () => {
    expect(() => assertPsbtComposition(options(true), inputs)).not.toThrow();
    for (const input of inputs)
      expect(() =>
        assertPsbtComposition(
          options(true),
          inputs.filter((path) => path !== input),
        ),
      ).toThrow("absent from the bundle graph");
  });
  it("rejects each orphaned owner when BIP38 is excluded", () => {
    for (const input of inputs)
      expect(() => assertPsbtComposition(options(false), [input])).toThrow(
        "excluded bip38-decrypt",
      );
  });
});
