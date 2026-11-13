import { describe, expect, it } from "vitest";
import {
  assertKeyDerivationComposition,
  selectedMessageSigningInstaller,
  selectedWorkerEntry,
} from "./key-derivation-composition.mjs";
import { parseKeyDerivationFeatures } from "./key-derivation-features.mjs";
import { BUILD_PROFILES } from "./build-profiles.mjs";

const ROOT = "/workspace";
const build = (coins, enabled = ["message-signing"]) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => enabled.includes(feature),
});
const FEATURE = "apps/key-derivation/src/ui/message-signing-feature.ts";
/** Cardano's own signing modules: its strict CBOR, its COSE structures and its row input. */
const CARDANO = [
  "packages/coin-protocols/src/coins/cardano/message-signing.ts",
  "packages/coin-protocols/src/coins/cardano/message-signing-cbor.ts",
  "packages/coin-protocols/src/coins/cardano/message-signing-cose.ts",
  "packages/coin-protocols/src/coins/cardano/message-signing-inputs.ts",
];

describe("Cardano's CIP-30 signData composes with Cardano and message signing alone", () => {
  it("composes only Cardano's policy, signer and known answers", () => {
    const alone = build(["cardano"]);
    expect(selectedMessageSigningInstaller(ROOT, alone)).toContain(
      "createMessageSigningInstaller(CARDANO_MESSAGE_SIGNING_POLICY)",
    );
    const worker = selectedWorkerEntry(ROOT, { id: "multi-chain" }, alone);
    expect(worker).toContain("new MessageSigners([CARDANO_MESSAGE_SIGNING])");
    expect(worker).toContain("runCardanoMessageSigningSelfTest");
    expect(worker).toContain("runCardanoMessageSigningFullSelfTest");
    expect(worker).not.toMatch(
      /BITCOIN|DASH_MESSAGE|ETHEREUM_MESSAGE|SOLANA|TON_MESSAGE|message-signing-public-key/u,
    );
  });

  it("holds Cardano's signing modules with Cardano only, and only with message signing", () => {
    expect(() =>
      assertKeyDerivationComposition(build(["cardano"]), [...CARDANO, FEATURE]),
    ).not.toThrow();
    for (const module of CARDANO) {
      expect(() => assertKeyDerivationComposition(build(["cardano"], []), [module])).toThrow(
        "message-signing is excluded",
      );
      expect(() => assertKeyDerivationComposition(build(["solana"]), [module, FEATURE])).toThrow(
        /cardano/u,
      );
    }
  });

  it("offers message signing by default in a build of Cardano alone", () => {
    const profile = BUILD_PROFILES["multi-chain"];
    expect(parseKeyDerivationFeatures(profile, ["--coins", "cardano"]).has("message-signing")).toBe(
      true,
    );
  });
});
