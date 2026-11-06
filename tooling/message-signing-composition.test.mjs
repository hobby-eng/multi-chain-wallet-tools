import { describe, expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";

const options = (enabled = []) => ({
  coins: ["bitcoin", "dash", "ethereum"],
  hasCoin: () => true,
  has: (feature) => enabled.includes(feature),
});

describe("message-signing composition", () => {
  it.each([
    "packages/crypto-core/src/bip322-signing.ts",
    "apps/key-derivation/src/workers/bip322-signer.ts",
  ])("requires message signing for its signing-only owner %s", (source) => {
    expect(() => assertKeyDerivationComposition(options(), [source])).toThrow(
      "message-signing is excluded",
    );
    expect(() =>
      assertKeyDerivationComposition(options(["message-signing"]), [
        source,
        "apps/key-derivation/src/ui/message-signing-feature.ts",
      ]),
    ).not.toThrow();
  });
});
