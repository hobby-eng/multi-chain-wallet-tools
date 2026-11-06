import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@ckd/recovery-mhfe-wasm/runtime/mhfe.wasm", () => ({ default: new Uint8Array() }));
import { MhfeEngine } from "../src/ui/recovery-mhfe-engine.js";
import { RecoveryJobGate } from "../src/ui/recovery-job-gate.js";
import { MhfeTask } from "../src/ui/recovery-mhfe-task.js";
import { installPage } from "./fake-mhfe-page.js";

function task() {
  const element = installPage();
  const jobs = new RecoveryJobGate();
  jobs.setReady(true);
  const status = element("#task-status");
  const cancel = element("#task-cancel");
  const owner = new MhfeTask({ jobs } as never, new MhfeEngine(), {
    status: status as never,
    cancel: cancel as never,
    name: "synthetic task",
    failure: "Synthetic failure.",
  });
  return { owner, status, jobs };
}

describe("MHFE tasks distinguish waiting from failure", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a waiting message without reporting failure or holding the job", async () => {
    const t = task();
    const failed = vi.fn();
    const holds = vi.fn(async () => undefined);
    await t.owner.run(async () => ({ wait: "Choose a password repair." }), { failed, holds });
    expect(t.status.textContent).toBe("Choose a password repair.");
    expect(t.status.classList.contains("warning")).toBe(false);
    expect(failed).not.toHaveBeenCalled();
    expect(holds).not.toHaveBeenCalled();
    expect(t.jobs.runningJob).toBeNull();
  });

  it("reports a refused operation through the failure handler", async () => {
    const t = task();
    const cause = new Error("Synthetic refusal.");
    const failed = vi.fn();
    await t.owner.run(
      async () => {
        throw cause;
      },
      { failed },
    );
    expect(t.status.textContent).toBe("Synthetic refusal.");
    expect(t.status.classList.contains("warning")).toBe(true);
    expect(failed).toHaveBeenCalledExactlyOnceWith(cause);
    expect(t.jobs.runningJob).toBeNull();
  });

  it("keeps a successful session reserved until its owner releases it", async () => {
    const t = task();
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holds = vi.fn(() => held);
    const running = t.owner.run(async () => undefined, { holds });
    await vi.waitFor(() => expect(holds).toHaveBeenCalledOnce());
    expect(t.jobs.runningJob).not.toBeNull();
    release();
    await running;
    expect(t.jobs.runningJob).toBeNull();
  });
});
