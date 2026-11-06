import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryFeatureFixture } from "@ckd/test-support/recovery-feature.js";

// Only the native asset-loading boundary changes; the committed Codex32 engine runs unchanged.
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

it("retires recovered diagnostic nodes before a QR import error replaces the result", async () => {
  const { page, context, jobs } = new RecoveryFeatureFixture();
  jobs.setReady(true);
  const identifier = page.require("codex32-identifier");
  identifier.value = "test";
  Object.assign(identifier, { setCustomValidity: () => undefined });
  page.require("codex32-secret-type").value = "bip39-entropy";
  page.require("codex32-restore-type").value = "bip39-entropy";
  recoveryFeature.install(context);
  const field = page.require("codex32-shares");
  // Official BIP93 256-bit unsplit vector, also pinned by the library's known-answer test.
  field.value = "ms10leetsllhdmn9m42vcsamx24zrxgs3qrl7ahwvhw4fnzrhve25gvezzyqqtum9pgv99ycma";
  page.require("restore-codex32").click();
  const result = page.require("codex32-restore-result");
  const reveal = result
    .querySelectorAll("button")
    .find((button) => button.textContent === "Show phrase");
  expect(reveal).toBeDefined();
  reveal?.click();
  const retired = result.querySelectorAll(".recovered-seed-diagnostic .secret-value");
  expect(retired.length).toBeGreaterThan(0);
  const parent = field.parentElement;
  if (parent === null) throw new Error("The native share input needs its parent.");
  const choice = parent.children[parent.children.indexOf(field) + 1];
  if (choice === undefined || typeof choice === "string")
    throw new Error("The QR chooser is missing.");
  const file = choice.querySelector('input[type="file"]');
  if (file === null) throw new Error("The QR chooser needs its native file input.");
  Object.assign(file, {
    files: [new File(["public invalid image"], "public-image.txt", { type: "text/plain" })],
  });
  file.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(result.textContent).toMatch(/image/iu));
  expect(retired.every((node) => node.textContent === "")).toBe(true);
});
