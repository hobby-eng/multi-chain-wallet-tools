import { afterEach, expect, it, vi } from "vitest";
import { CompleteIdPage } from "@ckd/test-support/complete-id-page.js";
import { SecretValue } from "@ckd/core/secret-value.js";
import { MissingWordsSearch } from "../src/ui/recovery-mhfe-missing-words.js";
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeTask } from "../src/ui/recovery-mhfe-task.js";

// No WebAssembly is instantiated; this supplies only the native asset import to the real engine.
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("retires task comparison bytes even when native cancellation throws", async () => {
  const page = new CompleteIdPage();
  const document = page.asDocument();
  const area = document.createElement("div");
  document.body.append(area);
  const field = document.createElement("input");
  area.append(field);
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const task = new MhfeTask({ jobs }, new MhfeEngine(), {
    status: document.createElement("p"),
    cancel: document.createElement("button"),
    name: "Synthetic pending native operation",
    failure: "Synthetic operation failed.",
    inputs: area,
    stop: () => {
      throw new Error("Synthetic native cancellation failure");
    },
  });
  const snapshots = vi.spyOn(SecretValue, "utf16Texts");
  field.value = "synthetic private source";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  const owner: unknown = snapshots.mock.results[0]?.value;
  if (!(owner instanceof SecretValue)) throw new Error("The task needs an owned comparison.");
  const pending = task.run((run) => run.step(() => new Promise<void>(() => {})));
  expect(() => task.retire()).toThrow("Synthetic native cancellation failure");
  expect(() => owner.assertLive()).toThrow(
    expect.objectContaining({ code: "core.secret-value.wiped" }),
  );
  await pending;
  expect(jobs.runningJob).toBeNull();
});

it("retires every comparison owner when the missing-words panel closes", () => {
  const page = new CompleteIdPage();
  const area = page.add("mhfe-decrypt-missing");
  const field = page.add("mhfe-decrypt-missing-passphrase", "input", area);
  const panel = new MissingWordsSearch(
    { jobs: new RecoveryJobGate() },
    new MhfeEngine(),
    "decrypt",
    page.asDocument().createElement("p"),
    { pim: () => 0, found: () => {}, back: () => {} },
  );
  const snapshots = vi.spyOn(SecretValue, "utf16Texts");
  field.value = "synthetic private BIP39 passphrase";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  expect(snapshots).toHaveBeenCalledTimes(2);
  panel.hide();
  expect(field.value).toBe("");
  for (const result of snapshots.mock.results) {
    const owner: unknown = result.value;
    if (!(owner instanceof SecretValue)) throw new Error("The comparison needs an owned snapshot.");
    expect(() => owner.assertLive()).toThrow(
      expect.objectContaining({ code: "core.secret-value.wiped" }),
    );
  }
});
