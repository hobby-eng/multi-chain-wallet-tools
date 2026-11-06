// Real job owner and native worker client; synthetic transport never executes recovery code.
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { MnemoCodeWorkerJob } from "../src/ui/recovery-mnemocode-worker-job.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { settlePromises } from "./fake-recovery-page.js";

// The page loads MnemoCode at startup; each worker is given its compiled module with the job.
beforeAll(async () => {
  await loadMnemoCode();
});

const workers: FakeRecoveryWorker[] = [];
function mount() {
  const page = new PassiveQrPage();
  page.add("clear-all", "button");
  vi.stubGlobal(
    "Worker",
    class extends FakeRecoveryWorker {
      constructor() {
        super();
        workers.push(this);
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-job-owner");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const button = page.add("search", "button");
  button.textContent = "Search";
  const cancel = page.add("stop", "button");
  cancel.hidden = true;
  const status = page.add("status");
  const job = new MnemoCodeWorkerJob<unknown, unknown>("Public passive source", {
    button: button as unknown as HTMLButtonElement,
    cancel: cancel as unknown as HTMLButtonElement,
    status: status as unknown as HTMLElement,
  });
  return { job, button, cancel, status, page };
}

afterEach(async () => {
  for (const worker of workers) worker.reply({ type: "result", outcome: { kind: "none" } });
  await settlePromises();
  workers.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps the newer run's Cancel and status when the previous reply arrives", async () => {
  const { job, cancel, status } = mount();
  const first = job.run({ text: "first public fixture" }, () => "First progress", "First");
  const older = FakeRecoveryWorker.latest;
  const second = job.run({ text: "second public fixture" }, () => "Second progress", "Second");
  const newer = FakeRecoveryWorker.latest;
  older.reply({ type: "result", outcome: { kind: "none", message: "Old" } });
  await settlePromises();
  const firstResult = await first;
  const retained = { status: status.textContent, visible: !cancel.hidden };
  cancel.click();
  newer.reply({ type: "result", outcome: { kind: "none", message: "Late" } });
  await second;
  expect(firstResult).toBeUndefined();
  expect(retained).toEqual({ status: "Second", visible: true });
  expect(newer.terminate).toHaveBeenCalledOnce();
});

it("revokes long-search confirmation when the person cancels the job", async () => {
  const { job, cancel } = mount();
  const inputs = JSON.stringify({ text: "public phrase fixture", passphrase: "TREZOR" });
  job.ask("Synthetic large search", inputs);
  expect(job.confirmed(inputs)).toBe(true);
  const pending = job.run({}, () => "Progress", "Starting");
  cancel.click();
  await pending;
  expect(job.confirmed(inputs)).toBe(false);
});

it("drops and wipes a delivered result when Cancel precedes the await continuation", async () => {
  const { job, cancel, status } = mount();
  const pending = job.run({}, () => "Progress", "Starting");
  const bytes = Uint8Array.of(7, 9);
  FakeRecoveryWorker.latest.reply({ type: "result", outcome: { list: { bytes } } });
  cancel.click();
  await expect(pending).resolves.toBeUndefined();
  expect([...bytes]).toEqual([0, 0]);
  expect(status.textContent).toContain("Stopped.");
});

it("hides Cancel when replacement native worker construction refuses", async () => {
  const { job, cancel } = mount();
  const old = job.run({}, () => "Progress", "First");
  expect(cancel.hidden).toBe(false);
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        throw new Error("Synthetic native construction refusal");
      }
    },
  );
  await expect(job.run({}, () => "Progress", "Replacement")).rejects.toThrow(
    "construction refusal",
  );
  await expect(old).resolves.toBeUndefined();
  expect(cancel.hidden).toBe(true);
});

it("stops native work on input revision and discards a late owned candidate list", async () => {
  const { job, status } = mount();
  const pending = job.run({}, () => "Progress", "Starting");
  const worker = FakeRecoveryWorker.latest;
  job.revise();
  const wasStopped = worker.terminate.mock.calls.length;
  const bytes = Uint8Array.of(1, 2, 3);
  worker.reply({ type: "result", outcome: { list: { bytes } } });
  await expect(pending).resolves.toBeUndefined();
  expect(wasStopped).toBe(1);
  expect([...bytes]).toEqual([0, 0, 0]);
  expect(status.textContent).toContain("inputs changed");
});

it("preserves exact confirmation inputs until replacement or revision", () => {
  const { job, button } = mount();
  const text = JSON.stringify({ text: "public fixture", passphrase: "\ufeffTREZOR\ud800" });
  job.ask("Synthetic question", text);
  expect(job.confirmed(text)).toBe(true);
  expect(job.confirmed(text + " ")).toBe(false);
  job.ask("Synthetic next question", "replacement");
  expect(job.confirmed(text)).toBe(false);
  expect(job.confirmed("replacement")).toBe(true);
  job.revise();
  expect(job.confirmed("replacement")).toBe(false);
  expect(button.textContent).toBe("Search");
});

it.each(["clear", "pagehide", "wipe"] as const)(
  "ends confirmation and pending work on %s",
  async (action) => {
    const { job, page, cancel } = mount();
    job.ask("Synthetic question", "public confirmation fixture");
    const pending = job.run({}, () => "Progress", "Starting");
    const worker = FakeRecoveryWorker.latest;
    if (action === "clear") page.require("clear-all").click();
    else if (action === "pagehide") page.window.dispatchEvent(new Event("pagehide"));
    else job.wipe();
    await expect(pending).resolves.toBeUndefined();
    expect(job.confirmed("public confirmation fixture")).toBe(false);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(cancel.hidden).toBe(true);
  },
);

it("wipes native confirmation allocations on replacement and disposal", () => {
  const { job } = mount();
  const allocations: Uint8Array[] = [];
  const encoder = new TextEncoder();
  const nativeEncode = encoder.encode.bind(encoder);
  vi.spyOn(TextEncoder.prototype, "encode").mockImplementation(function (this: TextEncoder, text) {
    const bytes = nativeEncode(text);
    allocations.push(bytes);
    return bytes;
  });
  job.ask("Synthetic question", "public first fixture");
  expect(allocations[0]?.some((byte) => byte !== 0)).toBe(true);
  job.ask("Synthetic next question", "public second fixture");
  expect(allocations[0]?.every((byte) => byte === 0)).toBe(true);
  expect(allocations[1]?.some((byte) => byte !== 0)).toBe(true);
  job[Symbol.dispose]();
  expect(allocations[1]?.every((byte) => byte === 0)).toBe(true);
});
