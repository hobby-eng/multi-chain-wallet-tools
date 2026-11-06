import { expect, it } from "vitest";
import { assertKeyDerivationComposition } from "./key-derivation-composition.mjs";
import { assertDashOnlyGraph } from "./build-profiles.mjs";
const feature = (enabled) => ({ has: (name) => enabled.includes(name), hasCoin: () => true });
const modules = [
  "apps/key-derivation/src/ui/recovery-slip39-create.ts",
  "apps/key-derivation/src/ui/recovery-slip39-restore.ts",
  "apps/key-derivation/src/workers/slip39-worker.ts",
  "apps/key-derivation/src/workers/slip39-worker-runtime.ts",
  "apps/key-derivation/src/workers/page-slip39-wordlist.ts",
  "packages/recovery-backup/src/slip39-restore-request.ts",
  "packages/recovery-backup/src/slip39-passphrase.ts",
];
it("excludes every new SLIP-39 leaf when the feature is absent", () => {
  for (const path of modules)
    expect(() => assertKeyDerivationComposition(feature([]), [path])).toThrow("slip39 is excluded");
});
it("admits exact shared SLIP-39 library leaves in Dash and rejects nearby unknown modules", () => {
  const shared = modules.filter((path) => path.startsWith("packages/"));
  expect(() => assertDashOnlyGraph(shared, "SLIP-39")).not.toThrow();
  for (const path of shared)
    expect(() => assertDashOnlyGraph([`${path}.backup`], "SLIP-39")).toThrow(
      "outside the Dash allowlist",
    );
});
it("admits the core's coded-refusal leaves beside SLIP-39 without MnemoCode", () => {
  const owner = "packages/recovery-backup/src/slip39-restore-request.ts";
  const leaves = ["defined", "error-catalog", "refusal"].map(
    (name) => `packages/crypto-core/src/${name}.ts`,
  );
  expect(() =>
    assertKeyDerivationComposition(feature(["slip39"]), [owner, ...leaves]),
  ).not.toThrow();
  expect(() =>
    assertKeyDerivationComposition(feature(["slip39"]), [
      owner,
      "packages/recovery-backup/src/mnemocode-engine.ts",
    ]),
  ).toThrow("mnemocode is excluded");
});
