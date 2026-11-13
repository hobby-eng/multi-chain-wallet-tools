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
const coinModule = (name) => `packages/coin-protocols/src/coins/${name}.ts`;
const ADR036 = [
  coinModule("message-signing-adr036"),
  coinModule("message-signing-secp256k1"),
  coinModule("message-signing-response"),
  "apps/key-derivation/src/ui/message-signing-policy-adr036.ts",
];
const ENVELOPE = [
  coinModule("message-signing-envelope"),
  "packages/crypto-core/src/message-signing-envelope-191.ts",
  "packages/crypto-core/src/message-signing-recoverable.ts",
];
const HEDERA = [
  coinModule("message-signing-ed25519"),
  coinModule("message-signing-secp256k1"),
  coinModule("message-signing-response"),
  "packages/crypto-core/src/message-signing-envelope-191.ts",
  coinModule("hedera/message-signing-hip820"),
  coinModule("hedera/message-signing-signature-map"),
];
const COINS = [
  ["cosmos", "COSMOS", "Cosmos"],
  ["injective", "INJECTIVE", "Injective"],
  ["hedera", "HEDERA", "Hedera"],
];

describe("ADR-036 and HIP-820 message signing composes with each coin alone", () => {
  it.each(COINS)("composes only %s's policy, signer and known answer", (coin, prefix, name) => {
    const alone = build([coin]);
    expect(selectedMessageSigningInstaller(ROOT, alone)).toContain(
      `createMessageSigningInstaller(${prefix}_MESSAGE_SIGNING_POLICY)`,
    );
    const worker = selectedWorkerEntry(ROOT, { id: "multi-chain" }, alone);
    expect(worker).toContain(`new MessageSigners([${prefix}_MESSAGE_SIGNING])`);
    expect(worker).toContain(`startupSelfTests: [run${name}MessageSigningSelfTest]`);
    expect(worker).not.toMatch(
      /BITCOIN|DASH_MESSAGE|ETHEREUM_MESSAGE|SOLANA|message-signing-compact/u,
    );
  });

  it("holds ADR-036's modules with Cosmos or Injective, the envelope with Injective, and HIP-820's with Hedera", () => {
    for (const coin of ["cosmos", "injective"])
      expect(() =>
        assertKeyDerivationComposition(build([coin]), [...ADR036, FEATURE]),
      ).not.toThrow();
    expect(() =>
      assertKeyDerivationComposition(build(["injective"]), [...ENVELOPE, FEATURE]),
    ).not.toThrow();
    expect(() =>
      assertKeyDerivationComposition(build(["hedera"]), [...HEDERA, FEATURE]),
    ).not.toThrow();
    expect(() =>
      assertKeyDerivationComposition(build(["cosmos"]), [
        coinModule("message-signing-envelope"),
        FEATURE,
      ]),
    ).toThrow("Shared module message-signing-envelope");
    expect(() =>
      assertKeyDerivationComposition(build(["hedera"]), [
        coinModule("message-signing-adr036"),
        FEATURE,
      ]),
    ).toThrow("Shared module message-signing-adr036");
    expect(() =>
      assertKeyDerivationComposition(build(["solana"]), [
        coinModule("message-signing-response"),
        FEATURE,
      ]),
    ).toThrow("Shared module message-signing-response");
  });

  it("keeps the new modules out of a build without message signing", () => {
    for (const module of [...ADR036, ...HEDERA.slice(3)])
      expect(() =>
        assertKeyDerivationComposition(build(["cosmos", "injective", "hedera"], []), [module]),
      ).toThrow("message-signing is excluded");
  });

  it("offers message signing by default in a build of one of the three coins alone", () => {
    const profile = BUILD_PROFILES["multi-chain"];
    for (const [coin] of COINS)
      expect(parseKeyDerivationFeatures(profile, ["--coins", coin]).has("message-signing")).toBe(
        true,
      );
  });
});
