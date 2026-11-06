import { expect, it } from "vitest";
import { diagnoseMnemonic } from "@ckd/core/bip39.js";
import { DeriverViewFixture } from "@ckd/test-support/deriver-view.js";

const PHRASE =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

it.each(["conceal", "empty"])("retires previously rendered diagnostic word nodes on %s", (mode) => {
  const native = new DeriverViewFixture();
  const root = native.page.require("seed-diagnostic");
  root.append(native.page.createElement("h3"));
  using diagnostic = diagnoseMnemonic(PHRASE);
  native.view.updateSeedDiagnostic(diagnostic, "73c5da0a", true);
  const words = root.querySelectorAll("td").filter((cell) => cell.textContent === "abandon");
  expect(words).toHaveLength(11);
  using next = diagnoseMnemonic(mode === "empty" ? "" : PHRASE);
  native.view.updateSeedDiagnostic(next, null, false);
  expect(words.every((cell) => cell.textContent === "")).toBe(true);
});
