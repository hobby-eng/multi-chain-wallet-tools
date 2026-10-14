import { afterEach, describe, expect, it, vi } from "vitest";

// A MnemoCode job whose inputs change while it runs: its progress, result and error all belong to
// the inputs it started with, so after an edit the status line shows none of them
// (AUD-024-API003). The worker is a synthetic stand-in that answers when the test says so.

interface FakeRun {
  progress: (progress: unknown) => void;
  resolve: (outcome: unknown) => void;
  reject: (cause: Error) => void;
}
const runs: FakeRun[] = [];

vi.mock("../src/workers/mnemocode-worker-client.js", () => ({
  JOB_STOPPED: "Stopped.",
  MnemoCodeWorker: class {
    run(_request: unknown, onProgress: (progress: unknown) => void): Promise<unknown> {
      return new Promise((resolve, reject) => {
        runs.push({ progress: onProgress, resolve, reject });
      });
    }
    terminate(): void {}
  },
}));

const { MnemoCodeWorkerJob } = await import("../src/ui/recovery-mnemocode-worker-job.js");

const DROPPED = "The inputs changed while the job ran, so its result was dropped.";

function setup() {
  runs.length = 0;
  const status = { textContent: "" };
  const job = new MnemoCodeWorkerJob<unknown, unknown>("synthetic worker source", {
    button: { textContent: "Search" } as HTMLButtonElement,
    cancel: { hidden: true, onclick: null } as unknown as HTMLButtonElement,
    status: status as HTMLElement,
  });
  const run = job.run({}, () => "progress line", "Starting");
  return { job, status, run, worker: runs[0]! };
}

describe("a MnemoCode job whose inputs changed while it ran", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows progress and a result for unchanged inputs", async () => {
    const { status, run, worker } = setup();
    worker.progress({});
    expect(status.textContent).toBe("progress line");
    worker.resolve({ found: true });
    await expect(run).resolves.toMatchObject({ outcome: { found: true } });
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
