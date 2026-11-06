import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runBlobWorkerSelfTest } from "../src/blob-worker-self-test.js";

class WorkerBoundary extends EventTarget {
  static latest: WorkerBoundary | undefined;
  static failConstruction = false;
  static failPost = false;
  readonly terminate = vi.fn();
  posted: unknown;

  constructor() {
    super();
    if (WorkerBoundary.failConstruction) throw new Error("Synthetic native construction refusal");
    WorkerBoundary.latest = this;
  }
  postMessage(value: unknown): void {
    if (WorkerBoundary.failPost) throw new Error("Synthetic native post refusal");
    this.posted = value;
  }
}

const revoke = vi.fn();
const create = vi.fn<(blob: Blob | MediaSource) => string>();
beforeEach(() => {
  vi.useFakeTimers();
  WorkerBoundary.latest = undefined;
  WorkerBoundary.failConstruction = WorkerBoundary.failPost = false;
  revoke.mockReset();
  create.mockReset().mockReturnValue("blob:public-self-test");
  vi.stubGlobal("Worker", WorkerBoundary);
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation(create);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function worker(): WorkerBoundary {
  const current = WorkerBoundary.latest;
  if (current === undefined) throw new Error("No native worker was constructed.");
  return current;
}
function released(): void {
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:public-self-test");
  expect(vi.getTimerCount()).toBe(0);
}

describe("the Blob Worker startup check releases every native resource", () => {
  it.each([0, -1, 1.5, NaN, Infinity, 3001])(
    "refuses invalid timeout %s before allocating native resources",
    async (timeout) => {
      await expect(runBlobWorkerSelfTest(timeout)).rejects.toMatchObject({
        code: "INVALID_TIMEOUT",
      });
      expect(create).not.toHaveBeenCalled();
      expect(WorkerBoundary.latest).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("still revokes the URL when native termination refuses", async () => {
    const pending = runBlobWorkerSelfTest(10);
    worker().terminate.mockImplementationOnce(() => {
      throw new Error("Synthetic native termination fault");
    });
    worker().dispatchEvent(new MessageEvent("message", { data: worker().posted }));
    await expect(pending).rejects.toMatchObject({ code: "NATIVE_FAILED" });
    released();
  });

  it("clears all deadlines and terminates when native URL revocation refuses", async () => {
    revoke.mockImplementationOnce(() => {
      throw new Error("Synthetic native URL fault");
    });
    const pending = runBlobWorkerSelfTest(10);
    worker().dispatchEvent(new MessageEvent("message", { data: worker().posted }));
    await expect(pending).rejects.toMatchObject({ code: "NATIVE_FAILED" });
    expect(worker().terminate).toHaveBeenCalledOnce();
    released();
  });

  it("releases the object URL when native construction refuses", async () => {
    WorkerBoundary.failConstruction = true;
    await expect(runBlobWorkerSelfTest(10)).rejects.toThrow();
    expect(WorkerBoundary.latest).toBeUndefined();
    released();
  });

  it("releases the response deadline when postMessage refuses", async () => {
    WorkerBoundary.failPost = true;
    await expect(runBlobWorkerSelfTest(10)).rejects.toThrow();
    expect(worker().terminate).toHaveBeenCalledOnce();
    released();
  });

  it("terminates and releases a successful real resource owner", async () => {
    const pending = runBlobWorkerSelfTest(10);
    worker().dispatchEvent(new MessageEvent("message", { data: worker().posted }));
    expect(await pending).toBeGreaterThanOrEqual(0);
    expect(worker().terminate).toHaveBeenCalledOnce();
    released();
  });

  it("refuses an unexpected response without leaving timers", async () => {
    const pending = runBlobWorkerSelfTest(10);
    worker().dispatchEvent(new MessageEvent("message", { data: "unexpected public response" }));
    await expect(pending).rejects.toThrow();
    expect(worker().terminate).toHaveBeenCalledOnce();
    released();
  });

  it("redacts an arbitrary native execution failure", async () => {
    const pending = runBlobWorkerSelfTest(10);
    const failure = new Event("error");
    Object.defineProperty(failure, "message", { value: "Public fake phrase in native detail" });
    worker().dispatchEvent(failure);
    await expect(pending).rejects.toMatchObject({
      code: "EXECUTION_BLOCKED",
      message: "Blob Worker execution was blocked.",
    });
    expect(worker().terminate).toHaveBeenCalledOnce();
    released();
  });

  it("terminates a worker that never answers and clears every deadline", async () => {
    const pending = runBlobWorkerSelfTest(10);
    const refusal = expect(pending).rejects.toThrow("Blob Worker startup timed out.");
    await vi.advanceTimersByTimeAsync(11);
    await refusal;
    expect(worker().terminate).toHaveBeenCalledOnce();
    released();
  });
});
