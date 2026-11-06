import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecoveryWorker } from "../src/workers/recovery-worker-client.js";
import { FakeRecoveryWorker } from "./fake-recovery-worker.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("Worker", FakeRecoveryWorker);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:public-generic-worker");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("settles and releases its worker when a host progress callback refuses", async () => {
  const revoke = vi.spyOn(URL, "revokeObjectURL");
  const client = new RecoveryWorker<string, string>("public worker", {
    label: "SLIP-39",
    errorPrefix: "wallet.slip39-worker",
  });
  const pending = client.run("public request", () => {
    throw new Error("synthetic private host detail");
  });
  const failure = pending.catch((cause: unknown) => cause);
  expect(() =>
    FakeRecoveryWorker.latest.reply({ type: "progress", progress: { checked: 1 } }),
  ).not.toThrow();
  expect(await failure).toMatchObject({
    code: "wallet.slip39-worker.progress",
    message: "The SLIP-39 worker progress could not be displayed.",
  });
  expect(FakeRecoveryWorker.latest.terminate).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it("passes an explicit transfer list while preserving ordinary terminal ownership", async () => {
  const client = new RecoveryWorker<{ bytes: Uint8Array }, string>("public worker", {
    label: "SLIP-39",
  });
  const bytes = Uint8Array.of(3, 4);
  let received: Uint8Array | undefined;
  FakeRecoveryWorker.latest.postMessage.mockImplementation(
    (request: { bytes: Uint8Array }, transfer: Transferable[]) => {
      received = structuredClone(request, { transfer }).bytes;
    },
  );
  const pending = client.run({ bytes }, () => undefined, [bytes.buffer]);
  expect(bytes.byteLength).toBe(0);
  expect(received).toEqual(Uint8Array.of(3, 4));
  FakeRecoveryWorker.latest.reply({ type: "result", outcome: "public result" });
  await expect(pending).resolves.toBe("public result");
  expect(FakeRecoveryWorker.latest.terminate).toHaveBeenCalledOnce();
});

it.each(["cancel", "result", "progress", "timeout", "ready"] as const)(
  "settles %s even if a native cleanup edge throws",
  async (reason) => {
    const client = new RecoveryWorker<string, string>("public source");
    let state = "pending";
    const pending = client.run("public request", () => {
      throw new Error("private progress detail");
    });
    const settled = pending.then(
      (value) => {
        state = typeof value === "string" ? value : value.kind;
      },
      (cause: unknown) => {
        state = cause instanceof Error ? cause.message : "invalid refusal";
      },
    );
    if (reason === "ready")
      vi.spyOn(URL, "revokeObjectURL").mockImplementationOnce(() => {
        throw new Error("private revoke detail");
      });
    else
      FakeRecoveryWorker.latest.terminate.mockImplementationOnce(() => {
        throw new Error("private terminate detail");
      });
    expect(() => {
      if (reason === "cancel") client.terminate();
      else if (reason === "timeout") vi.advanceTimersByTime(15_000);
      else if (reason === "ready") FakeRecoveryWorker.latest.reply({ type: "ready" });
      else if (reason === "progress")
        FakeRecoveryWorker.latest.reply({ type: "progress", progress: {} });
      else FakeRecoveryWorker.latest.reply({ type: "result", outcome: "public result" });
    }).not.toThrow();
    // Flush only native Promise reactions: a lost settlement must fail promptly, never hang.
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
    expect(state).not.toBe("pending");
    expect(state).not.toContain("private");
    await settled;
    expect(vi.getTimerCount()).toBe(0);
    expect(() => client.terminate()).not.toThrow();
    expect(FakeRecoveryWorker.latest.terminate).toHaveBeenCalledOnce();
  },
);

it("releases a received result the caller cannot take after native cleanup failure", async () => {
  const discard = vi.fn((value: Uint8Array) => value.fill(0));
  const client = new RecoveryWorker<string, Uint8Array>("public source", {
    discardOutcome: discard,
  });
  const pending = client.run("public request", () => undefined);
  const failure = pending.catch((cause: unknown) => cause);
  const bytes = Uint8Array.of(7, 8);
  FakeRecoveryWorker.latest.terminate.mockImplementationOnce(() => {
    throw new Error("private cleanup fault");
  });
  FakeRecoveryWorker.latest.reply({ type: "result", outcome: bytes });
  expect(await failure).toMatchObject({ code: "wallet.recovery-worker.cleanup" });
  expect(discard).toHaveBeenCalledExactlyOnceWith(bytes);
  expect(bytes).toEqual(Uint8Array.of(0, 0));
});

it("retires a late result after cancellation rather than abandoning its transferred buffer", async () => {
  const client = new RecoveryWorker<string, Uint8Array>("public source", {
    discardOutcome: (value) => value.fill(0),
  });
  const pending = client.run("public request", () => undefined);
  client.terminate();
  await pending;
  const bytes = Uint8Array.of(7, 8);
  FakeRecoveryWorker.latest.reply({ type: "result", outcome: bytes });
  expect(bytes).toEqual(Uint8Array.of(0, 0));
});
