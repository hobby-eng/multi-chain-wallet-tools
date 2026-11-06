import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadMnemoCode } from "@ckd/recovery-backup/mnemocode-module.js";
import { JOB_STOPPED, MnemoCodeWorker } from "../src/workers/mnemocode-worker-client.js";

import { FakeRecoveryWorker as FakeWorker } from "./fake-recovery-worker.js";

const revoke = vi.fn<(url: string) => void>();

// The page loads MnemoCode at startup; each worker is given its compiled module with the job.
beforeAll(async () => {
  await loadMnemoCode();
});

beforeEach(() => {
  revoke.mockClear();
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-mnemocode-worker");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MnemoCode worker job lifetime", () => {
  it("keeps a coded native refusal without copying its private cause", async () => {
    const client = new MnemoCodeWorker<string, string>("public test source");
    const pending = client.run("public request", vi.fn());
    const failure = pending.catch((cause: unknown) => cause);
    FakeWorker.latest.reply({
      type: "error",
      name: "RangeError",
      code: "core.dates.invalid-month",
      message: "The month is invalid.",
    });
    const cause = await failure;
    expect(cause).toBeInstanceOf(RangeError);
    expect(cause).toMatchObject({
      code: "core.dates.invalid-month",
      message: "The month is invalid.",
    });
    expect(Object.getOwnPropertyDescriptor(cause, "code")).toMatchObject({
      writable: false,
      configurable: false,
    });
    expect(cause).not.toHaveProperty("cause");
  });

  it("keeps one pending job and publishes its result before refusing further jobs", async () => {
    const client = new MnemoCodeWorker<string, string>("public test source");
    const progress = vi.fn();
    const pending = client.run("first public request", progress);
    await expect(client.run("second public request", progress)).rejects.toThrow(
      "already started a job",
    );
    expect(FakeWorker.latest.postMessage).toHaveBeenCalledExactlyOnceWith({
      module: expect.any(WebAssembly.Module),
      request: "first public request",
    });
    FakeWorker.latest.reply({ type: "ready" });
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
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
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects the pending job and releases resources when startup never completes", async () => {
    const client = new MnemoCodeWorker<string, string>("public test source");
    const pending = client.run("public request", vi.fn());
    const rejected = expect(pending).rejects.toThrow("did not become ready in time");
    vi.advanceTimersByTime(15_000);
    await rejected;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
    await expect(client.run("another public request", vi.fn())).rejects.toThrow(JOB_STOPPED);
  });

  it.each(["error", "cancel"])(
    "settles pending work on %s and ignores late messages",
    async (action) => {
      const client = new MnemoCodeWorker<string, string>("public test source");
      const progress = vi.fn();
      const pending = client.run("public request", progress);
      const settled =
        action === "error"
          ? expect(pending).rejects.toThrow("stopped unexpectedly")
          : expect(pending).resolves.toEqual({ kind: "stopped" });
      if (action === "error") FakeWorker.latest.onerror?.({ preventDefault: vi.fn() });
      else client.terminate();
      await settled;
      FakeWorker.latest.reply({ type: "progress", progress: { checked: 1 } });
      FakeWorker.latest.reply({ type: "result", outcome: "stale public result" });
      expect(progress).not.toHaveBeenCalled();
      expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
      expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:public-mnemocode-worker");
    },
  );
});

it.each(["cleanup", "late"] as const)(
  "releases candidate-list bytes after %s prevents transfer to the caller",
  async (reason) => {
    const client = new MnemoCodeWorker<string, { list: { bytes: Uint8Array } }>("public source");
    const pending = client.run("public request", () => undefined);
    const settled = pending.catch((cause: unknown) => cause);
    const bytes = Uint8Array.of(7, 8);
    if (reason === "late") client.terminate();
    else
      FakeWorker.latest.terminate.mockImplementationOnce(() => {
        throw new Error("private cleanup fault");
      });
    expect(() =>
      FakeWorker.latest.reply({ type: "result", outcome: { list: { bytes } } }),
    ).not.toThrow();
    await settled;
    expect(bytes).toEqual(Uint8Array.of(0, 0));
  },
);
