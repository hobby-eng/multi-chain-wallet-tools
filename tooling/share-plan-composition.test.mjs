import { expect, it } from "vitest";
import { assertDashOnlyGraph } from "./build-profiles.mjs";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";

const absent = { has: () => false, hasCoin: () => true };

it.each(["shares", "search", "wallet", "backup-check", "reencoding", "marked-codes", "heirs"])(
  "admits only the exact MnemoCode %s wrapper in Dash",
  (name) => {
    const path = `packages/recovery-backup/src/mnemocode-${name}.ts`;
    expect(() => assertDashOnlyGraph([path], "MnemoCode wrappers")).not.toThrow();
    expect(() => assertDashOnlyGraph([`${path}.backup`], "MnemoCode wrappers")).toThrow(
      "outside the Dash allowlist",
    );
  },
);

it("keeps the marked-code wrapper excluded when MnemoCode is absent", () => {
  expect(() =>
    assertKeyDerivationComposition(absent, [
      "packages/recovery-backup/src/mnemocode-marked-codes.ts",
    ]),
  ).toThrow("mnemocode is excluded");
});

it("keeps the card and heir-sheet wrappers excluded without card export", () => {
  for (const name of ["cards", "heirs"])
    expect(() =>
      assertKeyDerivationComposition(
        { has: (feature) => feature === "mnemocode", hasCoin: () => true },
        [`packages/recovery-backup/src/mnemocode-${name}.ts`],
      ),
    ).toThrow("mnemocode-cards is excluded");
});
