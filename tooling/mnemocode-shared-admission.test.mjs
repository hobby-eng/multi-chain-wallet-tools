import { describe, expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";
import { MnemoCodeSskrSource } from "./sync-mnemocode-sskr.mjs";

const options = (enabled = []) => ({
  coins: ["bitcoin", "dash", "ethereum"],
  hasCoin: () => true,
  has: (feature) => enabled.includes(feature),
});
const groups = "packages/recovery-backup/src/sskr-groups.ts";
const bridge = "packages/recovery-backup/src/sskr-bridge.ts";
const limits = "packages/recovery-backup/src/sskr-limits.ts";
const binding =
  "packages/recovery-mnemocode-wasm/generated/multi-chain/key-derivation/mnemocode.js";
const download = "apps/key-derivation/src/ui/recovery-mnemocode-download.ts";

describe("Shared MnemoCode admission boundaries", () => {
  it("keeps the word table and MnemoCode's WebAssembly with MnemoCode, with or without cards", () => {
    const table = "packages/recovery-backup/src/mnemocode-word-table.ts";
    for (const files of [[table], [binding], [download, binding]]) {
      expect(() => assertKeyDerivationComposition(options(["mnemocode"]), files)).not.toThrow();
      expect(() => assertKeyDerivationComposition(options(), files)).toThrow(
        "mnemocode is excluded",
      );
    }
  });

  it("keeps the cards and the heirs' sheet with mnemocode-cards", () => {
    for (const card of [
      "packages/recovery-backup/src/mnemocode-cards.ts",
      "packages/recovery-backup/src/mnemocode-heirs.ts",
    ]) {
      expect(() =>
        assertKeyDerivationComposition(options(["mnemocode", "mnemocode-cards"]), [card, binding]),
      ).not.toThrow();
      expect(() => assertKeyDerivationComposition(options(["mnemocode"]), [card])).toThrow(
        "mnemocode-cards is excluded",
      );
    }
  });

  it("admits the standard SSKR bridge and its limits without MnemoCode", () => {
    for (const enabled of [["sskr"], ["gordian-envelope"], []])
      expect(() =>
        assertKeyDerivationComposition(options(enabled), [groups, bridge, limits]),
      ).not.toThrow();
    expect(() =>
      assertKeyDerivationComposition(options(["sskr"]), [
        groups,
        "packages/recovery-backup/src/mnemocode-facts.ts",
      ]),
    ).toThrow("mnemocode is excluded");
    expect(() =>
      assertKeyDerivationComposition(options(), ["packages/recovery-backup/src/sskr.ts", bridge]),
    ).toThrow("sskr is excluded");
  });

  it("checks every imported bridge input and its package version", () => {
    expect(new MnemoCodeSskrSource().verify().version).toBe("0.1.9");
  });
});

describe("Shared byte-owner admission", () => {
  const sources = ["secret-value", "redacted", "error-catalog", "defined", "refusal"].map(
    (name) => `packages/crypto-core/src/${name}.ts`,
  );
  it.each([
    { consumer: "packages/shared-ui/src/field-import-revision.ts", feature: "seedqr" },
    { consumer: "apps/key-derivation/src/ui/recovery-mhfe-new-password.ts", feature: "mhfe" },
    {
      consumer: "apps/key-derivation/src/ui/bip38-encryption-feature.ts",
      feature: "bip38-encrypt",
    },
  ])(
    "admits the core's ownership leaves beside $consumer without MnemoCode",
    ({ consumer, feature }) => {
      expect(() =>
        assertKeyDerivationComposition(options([feature]), [consumer, ...sources]),
      ).not.toThrow();
      expect(() =>
        assertKeyDerivationComposition(options([feature]), [
          consumer,
          "packages/recovery-backup/src/mnemocode-engine.ts",
        ]),
      ).toThrow("mnemocode is excluded");
    },
  );
  it("keeps every new Matcher library/result owner excluded when Matcher is absent", () => {
    for (const module of ["matcher-plan", "matcher-scope", "matcher-secrets"])
      expect(() =>
        assertKeyDerivationComposition(options(), [
          `packages/wallet-recovery/src/${module}.ts`,
          ...sources,
        ]),
      ).toThrow("wallet-matcher is excluded");
    expect(() =>
      assertKeyDerivationComposition(options(), ["apps/key-derivation/src/ui/matcher-results.ts"]),
    ).toThrow("wallet-matcher is excluded");
  });
});
