import { RecoveryFeatureFixture } from "@ckd/test-support/recovery-feature.js";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

// Native asset loading only: execute the committed WASM bytes if an admitted operation needs them.
vi.mock("@ckd/recovery-envelope-wasm/recovery_envelope_wasm_bg.wasm", () => ({
  default: readFileSync(
    new URL(
      "../../../packages/recovery-envelope-wasm/generated/recovery_envelope_wasm_bg.wasm",
      import.meta.url,
    ),
  ),
}));
import { recoveryFeature } from "../src/ui/recovery-gordian-envelope.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  { action: "create-envelope", field: "envelope-source" },
  { action: "derive-envelope-recipient", field: "envelope-recipient-mnemonic" },
  { action: "restore-envelope", field: "envelope-records" },
])(
  "keeps $action closed before reading factors when startup readiness is absent",
  ({ action, field }) => {
    const { page, context } = new RecoveryFeatureFixture();
    page.require("envelope-recipient-source").value = "manual";
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
  },
);
