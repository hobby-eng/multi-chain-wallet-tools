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
const ENVELOPE = [
  "packages/coin-protocols/src/coins/message-signing-envelope.ts",
  "packages/crypto-core/src/message-signing-envelope-191.ts",
  "packages/crypto-core/src/message-signing-recoverable.ts",
];
const EVM_NOTE = "apps/key-derivation/src/ui/message-signing-policy-evm.ts";

describe("EIP-191 and TIP-191 message signing composes with each coin alone", () => {
  it.each([
    ["ethereum", "ETHEREUM", "Ethereum", true],
    ["ethereum-classic", "ETHEREUM_CLASSIC", "EthereumClassic", true],
    ["tron", "TRON", "Tron", false],
  ])(
    "composes only %s's policy, signer, key field and known answers",
    (coin, prefix, name, full) => {
      const alone = build([coin]);
      expect(selectedMessageSigningInstaller(ROOT, alone)).toContain(
        `createMessageSigningInstaller(${prefix}_MESSAGE_SIGNING_POLICY)`,
      );
      const worker = selectedWorkerEntry(ROOT, { id: "multi-chain" }, alone);
      expect(worker).toContain(`new MessageSigners([${prefix}_MESSAGE_SIGNING])`);
      expect(worker).toContain("admitMessageSigning: messageSigners.admit");
      expect(worker).toContain(`startupSelfTests: [run${name}MessageSigningSelfTest]`);
      if (full) expect(worker).toContain(`run${name}MessageSigningFullSelfTest`);
      expect(worker).not.toMatch(/BITCOIN|DASH_MESSAGE|LITECOIN|message-signing-compact/u);
    },
  );

  it("holds the envelope modules with any of the three coins, and the EVM note with Ethereum's two", () => {
    for (const coin of ["ethereum", "ethereum-classic", "tron"])
      expect(() =>
        assertKeyDerivationComposition(build([coin]), [...ENVELOPE, FEATURE]),
      ).not.toThrow();
    expect(() =>
      assertKeyDerivationComposition(build(["ethereum-classic"]), [EVM_NOTE, FEATURE]),
    ).not.toThrow();
    expect(() => assertKeyDerivationComposition(build(["tron"]), [EVM_NOTE, FEATURE])).toThrow(
      "Shared module message-signing-policy-evm",
    );
    for (const module of ENVELOPE)
      expect(() => assertKeyDerivationComposition(build(["litecoin"]), [module, FEATURE])).toThrow(
        "Shared module",
      );
  });

  it("keeps the envelope modules out of a build without message signing", () => {
    for (const module of ENVELOPE)
      expect(() => assertKeyDerivationComposition(build(["ethereum"], []), [module])).toThrow(
        "message-signing is excluded",
      );
  });

  it("offers message signing by default in a build of one of the three coins alone", () => {
    const profile = BUILD_PROFILES["multi-chain"];
    for (const coin of ["ethereum", "ethereum-classic", "tron"])
      expect(parseKeyDerivationFeatures(profile, ["--coins", coin]).has("message-signing")).toBe(
        true,
      );
  });
});
