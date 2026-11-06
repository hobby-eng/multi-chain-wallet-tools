import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryFeatureFixture } from "@ckd/test-support/recovery-feature.js";

// Native asset loading only; the committed engine and its identifier admission run unchanged.
vi.mock("@ckd/recovery-codex32-wasm/recovery_codex32_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-codex32-wasm/generated/recovery_codex32_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));
import { recoveryFeature } from "../src/ui/recovery-codex32.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { action: "create-codex32", field: "codex32-source" },
  { action: "restore-codex32", field: "codex32-shares" },
])("keeps $action closed before reading factors when readiness is absent", ({ action, field }) => {
  const { page, context } = new RecoveryFeatureFixture();
  const identifier = page.require("codex32-identifier");
  identifier.value = "test";
  Object.assign(identifier, { setCustomValidity: () => undefined });
  page.require("codex32-secret-type").value = "bip39-entropy";
  recoveryFeature.install(context);
  let reads = 0;
  Object.defineProperty(page.require(field), "value", {
    get: () => {
      reads += 1;
      throw new Error("Synthetic private native getter detail");
    },
  });
  page.require(action).dispatchEvent(new Event("click"));
  expect(reads).toBe(0);
});
