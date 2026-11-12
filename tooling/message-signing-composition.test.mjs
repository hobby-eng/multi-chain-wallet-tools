import { describe, expect, it } from "vitest";
import {
  assertKeyDerivationComposition,
  selectedMessageSigningInstaller,
  selectedWorkerEntry,
} from "./key-derivation-composition.mjs";
import { parseKeyDerivationFeatures } from "./key-derivation-features.mjs";
import { BUILD_PROFILES } from "./build-profiles.mjs";
import { MESSAGE_SIGNING_COIN_IDS, messageSigningModules } from "./message-signing-coins.mjs";

const options = (enabled = []) => ({
  coins: ["bitcoin", "dash", "ethereum"],
  hasCoin: () => true,
  has: (feature) => enabled.includes(feature),
});
const build = (coins, enabled = ["message-signing"]) => ({
  coins,
  hasCoin: (coin) => coins.includes(coin),
  has: (feature) => enabled.includes(feature),
});
const ROOT = "/workspace";

describe("message-signing composition", () => {
  it.each([
    "packages/crypto-core/src/bip322-signing.ts",
    "packages/coin-protocols/src/coins/message-signing.ts",
    "packages/coin-protocols/src/coins/bitcoin/message-signing.ts",
    "apps/key-derivation/src/ui/message-signing-verification.ts",
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

  it.each(MESSAGE_SIGNING_COIN_IDS)("keeps %s's policy and known answers with the coin", (coin) => {
    const others = MESSAGE_SIGNING_COIN_IDS.filter((other) => other !== coin);
    const { policy, selfTest } = messageSigningModules(coin);
    for (const source of [policy, selfTest])
      expect(() =>
        assertKeyDerivationComposition(build(others), [
          source,
          "apps/key-derivation/src/ui/message-signing-feature.ts",
        ]),
      ).toThrow(`Coin module ${coin}`);
  });

  it("composes only the Dash signer, policy and known answers into a Dash-only build", () => {
    const dash = build(["dash"]);
    const page = selectedMessageSigningInstaller(ROOT, dash);
    expect(page).toContain("createMessageSigningInstaller(DASH_MESSAGE_SIGNING_POLICY)");
    const worker = selectedWorkerEntry(ROOT, { id: "dash-community" }, dash);
    expect(worker).toContain("new MessageSigners([DASH_MESSAGE_SIGNING])");
    expect(worker).toContain("verifyDerivedMessage: messageSigners.verify");
    expect(worker).toContain("startupSelfTests: [runDashMessageSigningSelfTest]");
    for (const source of [page, worker]) {
      expect(source).not.toMatch(/bitcoin|bip322/iu);
      expect(source).not.toContain("combineMessageSigningPolicies");
    }
  });

  it("combines the policies and signers of every signing coin of the build", () => {
    const both = build(["bitcoin", "dash"]);
    expect(selectedMessageSigningInstaller(ROOT, both)).toContain(
      "combineMessageSigningPolicies(BITCOIN_MESSAGE_SIGNING_POLICY, DASH_MESSAGE_SIGNING_POLICY)",
    );
    const worker = selectedWorkerEntry(ROOT, { id: "multi-chain" }, both);
    expect(worker).toContain("new MessageSigners([BITCOIN_MESSAGE_SIGNING, DASH_MESSAGE_SIGNING])");
    expect(worker).toContain(
      "startupSelfTests: [runBitcoinMessageSigningSelfTest, runDashMessageSigningSelfTest]",
    );
    // Dash's masternode keys are its own protocol: they come with the coin, not with the feature.
    expect(worker).toContain(
      "fullSelfTests: [runBip322FullSelfTest, runDashMasternodeFullSelfTest]",
    );
  });

  it("composes no signer without the feature", () => {
    const off = build(["bitcoin", "dash"], []);
    expect(selectedMessageSigningInstaller(ROOT, off)).toBe("");
    expect(selectedWorkerEntry(ROOT, { id: "multi-chain" }, off)).not.toMatch(
      /MessageSigners|signDerivedMessage|verifyDerivedMessage/u,
    );
  });

  it("offers message signing by default only with a signing coin, and refuses it without one", () => {
    const profile = BUILD_PROFILES["multi-chain"];
    expect(parseKeyDerivationFeatures(profile, ["--coins", "dash"]).has("message-signing")).toBe(
      true,
    );
    expect(
      parseKeyDerivationFeatures(profile, ["--coins", "ethereum"]).has("message-signing"),
    ).toBe(false);
    expect(() =>
      parseKeyDerivationFeatures(profile, [
        "--coins",
        "ethereum",
        "--features",
        "derive,message-signing",
      ]),
    ).toThrow("Message signing needs a coin with a message-signing standard.");
  });
});
