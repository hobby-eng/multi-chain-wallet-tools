import { describe, expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";
import { MnemoCodeSskrSource } from "./sync-mnemocode-sskr.mjs";

const options = (enabled = []) => ({
  coins: ["bitcoin", "dash", "ethereum"],
  hasCoin: () => true,
  has: (feature) => enabled.includes(feature),
});
const owner = "packages/recovery-backup/src/sskr-groups.ts";
const bridge = "packages/recovery-mnemocode/source/sskr/bridge.ts";
const filename = "packages/recovery-mnemocode/source/export/file-name.ts";
const download = "apps/key-derivation/src/ui/recovery-mnemocode-download.ts";

describe("Shared MnemoCode admission boundaries", () => {
  it("admits the checked standard SSKR bridge only beside its real host admission owner", () => {
    expect(() => assertKeyDerivationComposition(options(), [owner, bridge])).not.toThrow();
    for (const lookalike of [[], [`${owner}.backup`]])
      expect(() => assertKeyDerivationComposition(options(), [...lookalike, bridge])).toThrow(
        "mnemocode is excluded",
      );
    expect(() =>
      assertKeyDerivationComposition(options(), [
        owner,
        "packages/recovery-mnemocode/source/core/masking.ts",
      ]),
    ).toThrow("mnemocode is excluded");
  });

  it("shares only filename admission with a MnemoCode download when cards are absent", () => {
    expect(() =>
      assertKeyDerivationComposition(options(["mnemocode"]), [download, filename]),
    ).not.toThrow();
    expect(() => assertKeyDerivationComposition(options(["mnemocode"]), [filename])).toThrow(
      "mnemocode-cards is excluded",
    );
    expect(() =>
      assertKeyDerivationComposition(options(["mnemocode"]), [
        download,
        "packages/recovery-mnemocode/source/export/render.ts",
      ]),
    ).toThrow("mnemocode-cards is excluded");
    expect(() => assertKeyDerivationComposition(options(), [download, filename])).toThrow(
      "mnemocode is excluded",
    );
  });

  it("checks every imported bridge input and its package version", () => {
    expect(new MnemoCodeSskrSource().verify().version).toBe("0.1.7");
  });

  it("shares the seed-width constant only with the actual standard SSKR host", () => {
    const source = "packages/recovery-mnemocode/source/sskr/share-platform.ts";
    expect(() =>
      assertKeyDerivationComposition(options(["sskr"]), [
        "packages/recovery-backup/src/sskr.ts",
        source,
      ]),
    ).not.toThrow();
    expect(() => assertKeyDerivationComposition(options(["sskr"]), [source])).toThrow(
      "mnemocode is excluded",
    );
    expect(() =>
      assertKeyDerivationComposition(options(), ["packages/recovery-backup/src/sskr.ts", source]),
    ).toThrow("sskr is excluded");
  });
});
