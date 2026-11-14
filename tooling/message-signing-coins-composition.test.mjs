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
const COMPACT_MODULE = "packages/coin-protocols/src/coins/message-signing-compact.ts";
const FEATURE = "apps/key-derivation/src/ui/message-signing-feature.ts";

describe("the compact coins' message signing composes with each coin alone", () => {
  it.each([
    ["litecoin", "LITECOIN", "Litecoin", ""],
    ["dogecoin", "DOGECOIN", "Dogecoin", ""],
    ["bitcoin-cash", "BITCOIN_CASH", "BitcoinCash", ""],
    // Zcash's own full known answers, of its Sapling keys, come with the coin, not the feature.
    ["zcash", "ZCASH", "Zcash", ", runZcashSaplingKeyFullSelfTest"],
  ])("composes only %s's policy, signer and known answers", (coin, prefix, name, coinTests) => {
    const alone = build([coin]);
    const page = selectedMessageSigningInstaller(ROOT, alone);
    expect(page).toContain(`createMessageSigningInstaller(${prefix}_MESSAGE_SIGNING_POLICY)`);
    const worker = selectedWorkerEntry(ROOT, { id: "multi-chain" }, alone);
    expect(worker).toContain(`new MessageSigners([${prefix}_MESSAGE_SIGNING])`);
    expect(worker).toContain(`startupSelfTests: [run${name}MessageSigningSelfTest]`);
    expect(worker).toContain(`fullSelfTests: [run${name}MessageSigningFullSelfTest${coinTests}]`);
    for (const source of [page, worker])
      expect(source).not.toMatch(/BITCOIN_MESSAGE|DASH_MESSAGE|bip322|-dash\.ts|-bitcoin\.ts/u);
  });

  it("holds the shared compact module only with a compact coin and the feature", () => {
    const inputs = [COMPACT_MODULE, FEATURE];
    expect(() => assertKeyDerivationComposition(build(["litecoin"]), inputs)).not.toThrow();
    expect(() => assertKeyDerivationComposition(build(["dash"]), inputs)).toThrow(
      "Shared module message-signing-compact",
    );
    expect(() => assertKeyDerivationComposition(build(["zcash"], []), [COMPACT_MODULE])).toThrow(
      "message-signing is excluded",
    );
  });

  it("keeps each compact coin's signer out of a build without the coin", () => {
    for (const coin of ["litecoin", "dogecoin", "bitcoin-cash", "zcash"])
      expect(() =>
        assertKeyDerivationComposition(build(["dash"]), [
          `packages/coin-protocols/src/coins/${coin}/message-signing.ts`,
          FEATURE,
        ]),
      ).toThrow(`Coin module ${coin}`);
  });

  it("offers message signing by default in a build of a compact coin alone", () => {
    const profile = BUILD_PROFILES["multi-chain"];
    for (const coin of ["litecoin", "dogecoin", "bitcoin-cash", "zcash"])
      expect(parseKeyDerivationFeatures(profile, ["--coins", coin]).has("message-signing")).toBe(
        true,
      );
  });
});
