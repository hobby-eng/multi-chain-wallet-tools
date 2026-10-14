import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_STOPPED, MnemoCodeWorker } from "../src/workers/mnemocode-worker-client.js";

class FakeWorker {
  static latest: FakeWorker;
  onmessage: ((event: { data: unknown }) => void) | undefined;
  onerror: ((event: { preventDefault(): void }) => void) | undefined;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  constructor() {
    FakeWorker.latest = this;
  }

  reply(data: unknown): void {
    this.onmessage?.({ data });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-mnemocode-worker");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MnemoCode worker job lifetime", () => {
  it("keeps one pending job and publishes its result before refusing further jobs", async () => {
    const client = new MnemoCodeWorker<string, string>("public test source");
    const progress = vi.fn();
    const pending = client.run("first public request", progress);
    await expect(client.run("second public request", progress)).rejects.toThrow(
      "already started a job",
    );
    expect(FakeWorker.latest.postMessage).toHaveBeenCalledExactlyOnceWith("first public request");
    FakeWorker.latest.reply({ type: "ready" });
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
    FakeWorker.latest.reply({ type: "result", outcome: "public result" });
    await expect(pending).resolves.toBe("public result");
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
    FakeWorker.latest.reply({ type: "progress", progress: { checked: 1 } });
    expect(progress).not.toHaveBeenCalled();
    await expect(client.run("third public request", progress)).rejects.toThrow(JOB_STOPPED);
    client.terminate();
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });

  it("releases the worker and URL when postMessage throws", async () => {
    const client = new MnemoCodeWorker<string, string>("public test source");
    FakeWorker.latest.postMessage.mockImplementation(() => {
      throw new Error("synthetic clone failure");
    });
    await expect(client.run("public request", vi.fn())).rejects.toThrow("synthetic clone failure");
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects the pending job and releases resources when startup never completes", async () => {
    const client = new MnemoCodeWorker<string, string>("public test source");
    const pending = client.run("public request", vi.fn());
    const rejected = expect(pending).rejects.toThrow("did not become ready in time");
    vi.advanceTimersByTime(15_000);
    await rejected;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
    await expect(client.run("another public request", vi.fn())).rejects.toThrow(JOB_STOPPED);
  });

  it.each(["error", "cancel"])(
    "settles pending work on %s and ignores late messages",
    async (action) => {
      const client = new MnemoCodeWorker<string, string>("public test source");
      const progress = vi.fn();
      const pending = client.run("public request", progress);
      const rejected = expect(pending).rejects.toThrow(
        action === "error" ? "stopped unexpectedly" : JOB_STOPPED,
      );
      if (action === "error") FakeWorker.latest.onerror?.({ preventDefault: vi.fn() });
      else client.terminate();
      await rejected;
      FakeWorker.latest.reply({ type: "progress", progress: { checked: 1 } });
      FakeWorker.latest.reply({ type: "result", outcome: "stale public result" });
      expect(progress).not.toHaveBeenCalled();
      expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
    },
  );
});
