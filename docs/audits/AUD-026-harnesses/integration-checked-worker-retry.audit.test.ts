// AUD-026 integration reviewer, CHECK-API-002: the production CheckedMnemonicFeature (Generate &
// Derive's "MHFE wallet check") and MhfePanelCheck with a fake engine whose first quick check
// rejects with WORKER_FAILED, as the package rejects when its worker did not start. MhfePanelCheck
// documents that such a failure "gave no wrong answer: the next opening tries again"; the check
// below states that expectation for the checked mode. No WASM runs.
import { describe, expect, it, vi } from "vitest";

vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import { CheckedMnemonicFeature } from "../../../apps/key-derivation/src/ui/checked-mnemonic-feature.js";
import type { MhfeEngine } from "../../../apps/key-derivation/src/ui/recovery-mhfe-engine.js";

class Control extends EventTarget {
  checked = false;
  disabled = false;
  hidden = false;
  inert = false;
  open = false;
  value = "";
  textContent = "";
  readonly classList = { toggle: vi.fn() };
}

describe("AUD-026 integration: MHFE wallet check after a worker that did not start", () => {
  it("offers the mode again after WORKER_FAILED, as MhfePanelCheck allows", async () => {
    const ids = [
      "wallet-check-enabled",
      "wallet-check-options",
      "wallet-check-help",
      "wallet-check-status",
      "wallet-check-outlook",
      "wallet-check-passphrase-repeat",
      "wallet-check-cancel",
      "passphrase",
      ...[12, 15, 18, 21, 24].map((n) => `generate-${n}`),
    ];
    const elements = Object.fromEntries(ids.map((id) => [id, new Control()]));
    const page = {
      querySelector: (selector: string) => elements[selector.slice(1)] ?? null,
    } as unknown as Document;
    const passed = {
      passed: true,
      tier: "startup",
      version: "0.5.1",
      buildId: "test",
      components: [],
    };
    // The first quick check finds no worker; the second one passes.
    const startupChecks = vi
      .fn()
      .mockRejectedValueOnce(
        new MhfeError("WORKER_FAILED", "The worker did not start within a minute."),
      )
      .mockResolvedValue([{ name: "Wallet", report: passed }]);
    const engine = {
      wallet: async () => ({
        describeDraw: async () => ({ randomness: "ample", randomBits: 240 }),
      }),
      walletParameters: async () => ({ recommendedRandomBits: 240 }),
      startupChecks,
      passed: vi.fn(),
      cancelDraw: vi.fn(),
    };
    const feature = new CheckedMnemonicFeature(
      page,
      () => undefined,
      engine as unknown as MhfeEngine,
    );
    feature.setEnabled(true);
    const box = elements["wallet-check-enabled"]!;
    box.checked = true;
    box.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(box.checked).toBe(false));
    const afterFailure = {
      status: elements["wallet-check-status"]!.textContent,
      boxDisabled: box.disabled,
    };
    console.log(JSON.stringify(afterFailure, null, 2));
    expect(afterFailure.status).toMatch(/could not check itself/u);
    // Expected: the person can tick the box again, and the next quick check runs.
    expect(box.disabled, "the box stays offered after a worker that did not start").toBe(false);
  });
});
