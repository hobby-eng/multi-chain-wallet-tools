import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { MnemoCodeWorkerJob } from "../src/ui/recovery-mnemocode-worker-job.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";
import { PassiveQrPage } from "../../../test/support/qr-page.js";
import { JOB_STOPPED } from "../src/workers/mnemocode-worker-client.js";

// The page loads MnemoCode at startup; each worker is given its compiled module with the job.
beforeAll(async () => {
  await loadMnemoCode();
});

// A MnemoCode job whose inputs change while it runs: its progress, result and error all belong to
// the inputs it started with, so after an edit the status line shows none of them
// (AUD-024-API003). Program modules run unchanged; only native transport is passive.

const DROPPED = "The inputs changed while the job ran, so its result was dropped.";

function setup() {
  vi.stubGlobal("Worker", FakeRecoveryWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-job-control");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const page = new PassiveQrPage();
  const status = page.add("status");
  const job = new MnemoCodeWorkerJob<unknown, unknown>("synthetic worker source", {
    button: page.add("search", "button") as unknown as HTMLButtonElement,
    cancel: page.add("stop", "button") as unknown as HTMLButtonElement,
    status: status as unknown as HTMLElement,
  });
  const run = job.run({}, () => "progress line", "Starting");
  const native = FakeRecoveryWorker.latest;
  const worker = {
    progress: (progress: unknown) => native.reply({ type: "progress", progress }),
    resolve: (outcome: unknown) => native.reply({ type: "result", outcome }),
    reject: (cause: Error) =>
      native.reply({ type: "error", name: "Error", message: cause.message }),
  };
  return { job, status, run, worker };
}

describe("a MnemoCode job whose inputs changed while it ran", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows progress and a result for unchanged inputs", async () => {
    const { status, run, worker } = setup();
    worker.progress({});
    expect(status.textContent).toBe("progress line");
    worker.resolve({ found: true });
    await expect(run).resolves.toMatchObject({ outcome: { found: true } });
  });
  it.each([{ kind: "stopped" }, { stopped: true }])(
    "discards a stopped library reply instead of publishing candidates",
    async (stopped) => {
      const { status, run, worker } = setup();
      const bytes = Uint8Array.of(7, 11);
      worker.resolve({ ...stopped, list: { bytes } });
      await expect(run).resolves.toBeUndefined();
      expect(status.textContent).toBe(JOB_STOPPED);
      expect([...bytes]).toEqual([0, 0]);
    },
  );

  it("does not parse an operational error's text as a cancellation", async () => {
    const { run, worker } = setup();
    worker.reject(new Error("Stopped."));
    await expect(run).rejects.toThrow("Stopped.");
  });

  it("shows no progress of the older inputs and wipes their result's list", async () => {
    const { job, status, run, worker } = setup();
    job.revise();
    worker.progress({});
    expect(status.textContent).toBe("Starting");
    const list = { bytes: new Uint8Array([1, 2, 3]) };
    worker.resolve({ list });
    await expect(run).resolves.toBeUndefined();
    expect(list.bytes).toEqual(new Uint8Array(3));
    expect(status.textContent).toBe(DROPPED);
  });

  it("shows no error of the older inputs either", async () => {
    const { job, status, run, worker } = setup();
    job.revise();
    worker.reject(new Error("synthetic refusal of the older inputs"));
    await expect(run).resolves.toBeUndefined();
    expect(status.textContent).toBe(DROPPED);
  });

  it("still reports an error of the current inputs", async () => {
    const { run, worker } = setup();
    worker.reject(new Error("synthetic refusal"));
    await expect(run).rejects.toThrow("synthetic refusal");
  });
});
