// Real admission, client and UI. Only native Worker delivery and the costly KDF are passive.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { PassiveSlip39 } from "../../../test/support/slip39-passive.js";
import { Slip39Page } from "./slip39-page.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";
import { edit, settlePromises } from "./fake-recovery-page.js";
import { JOB_STOPPED } from "../src/workers/recovery-worker-client.js";
import type { Slip39RestoreWire } from "@ckd/recovery-backup/slip39-restore-request.js";

vi.mock("@ckd/ui/qr-image-import.js", () => ({ installQrImageImport: () => undefined }));
vi.mock("@noble/hashes/pbkdf2.js", () => ({
  pbkdf2: vi.fn(
    (_h: unknown, _p: Uint8Array, _s: Uint8Array, o: { dkLen: number }) => new Uint8Array(o.dkLen),
  ),
}));
let requests: Slip39RestoreWire[];
let workers: FakeRecoveryWorker[];
class TransferWorker extends FakeRecoveryWorker {
  constructor() {
    super();
    workers.push(this);
  }
  override readonly postMessage = vi.fn((request: Slip39RestoreWire, transfer: Transferable[]) => {
    requests.push(structuredClone(request, { transfer }));
  });
}
beforeEach(() => {
  requests = [];
  workers = [];
  vi.useFakeTimers();
  vi.stubGlobal("Worker", TransferWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-slip39-worker");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});
afterEach(() => {
  // Passive workers keep transferred inputs so the test can inspect them; retire them here.
  for (const request of requests) {
    request.shares.fill(0);
    request.passphrase.fill(0);
  }
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("assesses exponent15 without a KDF and confirms only the unchanged input revision", async () => {
  const view = new Slip39Page(PassiveSlip39.share(15));
  view.restore();
  expect(workers).toHaveLength(0);
  expect(pbkdf2).not.toHaveBeenCalled();
  expect(view.page.require("restore-slip39-shares").textContent).toBe("Restore anyway");
  edit(view.page.require("slip39-restore-passphrase"), "changed ASCII password");
  view.restore();
  expect(workers).toHaveLength(0);
  view.restore();
  expect(requests).toHaveLength(1);
  expect(requests[0]?.confirmed).toBe(true);
  expect(new TextDecoder().decode(requests[0]?.passphrase)).toBe("changed ASCII password");
  expect(pbkdf2).not.toHaveBeenCalled();
  expect(view.jobs.runningJob).toBe("SLIP-39 restoration");
  view.page.require("slip39-restore-stop").click();
  await settlePromises();
  expect(view.result.textContent).toBe(JOB_STOPPED);
  expect(workers[0]?.terminate).toHaveBeenCalledOnce();
  expect(view.jobs.runningJob).toBeNull();
  expect(view.page.require("slip39-restore-stop").hidden).toBe(true);
});

it("publishes a current synthetic worker result and releases its returned entropy", async () => {
  const view = new Slip39Page(PassiveSlip39.share(1));
  view.restore();
  expect(requests[0]?.confirmed).toBe(false);
  const entropy = new Uint8Array(16);
  FakeRecoveryWorker.latest.reply({ type: "result", outcome: entropy });
  await settlePromises();
  expect(view.result.querySelector("textarea")?.value).toBe(`${"abandon ".repeat(11)}about`);
  expect(entropy.every((byte) => byte === 0)).toBe(true);
  expect(view.page.require("restore-slip39-shares").disabled).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["edit", "clear", "pagehide", "gate", "cancel"] as const)(
  "drops an already delivered result on %s before its await continuation",
  async (reason) => {
    const view = new Slip39Page(PassiveSlip39.share(1));
    view.page.require("slip39-restore-passphrase").value = "public password fixture";
    view.restore();
    const entropy = new Uint8Array(16).fill(7);
    FakeRecoveryWorker.latest.reply({ type: "result", outcome: entropy });
    if (reason === "edit") edit(view.page.require("slip39-shares"), "invalid replacement");
    else if (reason === "clear") view.page.require("clear-all").click();
    else if (reason === "pagehide") view.page.window.dispatchEvent(new Event("pagehide"));
    else if (reason === "gate") {
      view.jobs.setReady(false);
      view.jobs.setReady(true);
    } else view.page.require("slip39-restore-stop").click();
    await settlePromises();
    expect(view.result.querySelector("textarea")).toBeNull();
    expect(entropy.every((byte) => byte === 0)).toBe(true);
    expect(view.jobs.runningJob).toBeNull();
    expect(workers[0]?.terminate).toHaveBeenCalledOnce();
    if (reason === "clear" || reason === "pagehide") {
      expect(view.page.require("slip39-shares").value).toBe("");
      expect(view.page.require("slip39-restore-passphrase").value).toBe("");
    }
  },
);

it("terminates a pending worker on edit and permits a fresh operation after settlement", async () => {
  const share = PassiveSlip39.share(1);
  const view = new Slip39Page(share);
  view.restore();
  edit(view.page.require("slip39-shares"), share);
  await settlePromises();
  expect(workers[0]?.terminate).toHaveBeenCalledOnce();
  expect(view.result.querySelector("textarea")).toBeNull();
  view.restore();
  expect(workers).toHaveLength(2);
  FakeRecoveryWorker.latest.reply({
    type: "error",
    name: "Error",
    code: "wallet.fixture.refusal",
    message: "Public refusal",
  });
  await settlePromises();
  expect(view.result.textContent).toBe("Public refusal");
  expect(view.jobs.runningJob).toBeNull();
});
