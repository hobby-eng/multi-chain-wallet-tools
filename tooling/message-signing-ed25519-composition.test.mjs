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
const ED25519 = "packages/coin-protocols/src/coins/message-signing-ed25519.ts";
/** Each coin's own standard, which no build without the coin may hold. */
const STANDARDS = {
  solana: "packages/coin-protocols/src/coins/solana/message-signing-offchain.ts",
  stellar: "packages/coin-protocols/src/coins/stellar/message-signing-sep53.ts",
  near: "packages/coin-protocols/src/coins/near/message-signing-nep413.ts",
  ton: "packages/coin-protocols/src/coins/ton/message-signing-sign-data.ts",
};
const COINS = [
  ["solana", "SOLANA", "Solana"],
  ["stellar", "STELLAR", "Stellar"],
  ["near", "NEAR", "Near"],
  ["ton", "TON", "Ton"],
];

describe("Ed25519 message signing composes with each coin alone", () => {
  it.each(COINS)("composes only %s's policy, signer and known answers", (coin, prefix, name) => {
    const alone = build([coin]);
    expect(selectedMessageSigningInstaller(ROOT, alone)).toContain(
      `createMessageSigningInstaller(${prefix}_MESSAGE_SIGNING_POLICY)`,
    );
    const worker = selectedWorkerEntry(ROOT, { id: "multi-chain" }, alone);
    expect(worker).toContain(`new MessageSigners([${prefix}_MESSAGE_SIGNING])`);
    expect(worker).toContain(`startupSelfTests: [run${name}MessageSigningSelfTest]`);
    expect(worker).toContain(`run${name}MessageSigningFullSelfTest`);
    expect(worker).not.toMatch(/BITCOIN|DASH_MESSAGE|ETHEREUM|message-signing-compact/u);
  });

  it("holds the shared Ed25519 binding and each coin's own standard with that coin only", () => {
    for (const [coin] of COINS)
      expect(() =>
        assertKeyDerivationComposition(build([coin]), [ED25519, STANDARDS[coin], FEATURE]),
      ).not.toThrow();
    expect(() => assertKeyDerivationComposition(build(["bitcoin"]), [ED25519, FEATURE])).toThrow(
      "Shared module message-signing-ed25519",
    );
    expect(() =>
      assertKeyDerivationComposition(build(["solana"]), [STANDARDS.near, FEATURE]),
    ).toThrow();
  });

  it("keeps the Ed25519 modules out of a build without message signing", () => {
    for (const module of [ED25519, ...Object.values(STANDARDS)])
      expect(() =>
        assertKeyDerivationComposition(build(["solana", "stellar", "near", "ton"], []), [module]),
      ).toThrow("message-signing is excluded");
  });

  it("offers message signing by default in a build of one of the four coins alone", () => {
    const profile = BUILD_PROFILES["multi-chain"];
    for (const [coin] of COINS)
      expect(parseKeyDerivationFeatures(profile, ["--coins", coin]).has("message-signing")).toBe(
        true,
      );
  });
});
