import { afterEach, describe, expect, it, vi } from "vitest";
import * as registry from "@ckd/coins/registry.js";
import { runBitcoinPathSelfTest } from "@ckd/coins/bitcoin/path-self-test.js";
import { runDashPathSelfTest } from "@ckd/coins/dash/path-self-test.js";
import { runEthereumPathSelfTest } from "@ckd/coins/ethereum/path-self-test.js";
import { runLocalSearchSelfTest } from "@ckd/verification/local-search-self-test.js";
import * as searchChecks from "@ckd/recovery/local-search-self-test.js";
import type { CryptoSelfTestReport } from "@ckd/self-test-types";
import { startDerivationWorker } from "../src/workers/worker-runtime.js";
import type { WorkerMessage, WorkerRequest } from "../src/workers/protocol.js";

function report(checks: string[]): CryptoSelfTestReport {
  return { passed: true, checks, durationMs: 0 };
}

/** Exercise the real self-test request route with metadata and queue checks only. */
function workerSelfTest(
  full: boolean,
  dependencies: Parameters<typeof startDerivationWorker>[0],
): Promise<WorkerMessage> {
  let listener!: (event: MessageEvent<WorkerRequest>) => void;
  let resolve!: (message: WorkerMessage) => void;
  const reply = new Promise<WorkerMessage>((done) => {
    resolve = done;
  });
  vi.stubGlobal("self", {
    addEventListener(_type: string, callback: typeof listener) {
      listener = callback;
    },
    postMessage(message: WorkerMessage) {
      if ("id" in message && message.id === 1) resolve(message);
    },
  });
  startDerivationWorker(dependencies);
  listener({ data: { id: 1, type: "self-test", full } } as MessageEvent<WorkerRequest>);
  return reply;
}

describe("worker path and local-search self-test wiring", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([false, true])("runs each cheap suite once with full=%s", async (full) => {
    const pathChecks = [
      ...runBitcoinPathSelfTest(registry),
      ...runDashPathSelfTest(registry),
      ...runEthereumPathSelfTest(registry),
    ];
    const base = vi.fn(async () => report(pathChecks));
    const local = vi.fn(runLocalSearchSelfTest);
    const slow = vi.fn(() => report(["Controlled full-only check"]));
    const getRuntimeCoinAdapter = vi.fn(() => {
      throw new Error("Self-test wiring must not derive keys.");
    });
    const reply = await workerSelfTest(full, {
      getRuntimeCoinAdapter,
      runDerivationSelfTest: base,
      startupSelfTests: [local],
      fullSelfTests: [slow],
    });
    expect(base).toHaveBeenCalledTimes(1);
    expect(local).toHaveBeenCalledTimes(1);
    expect(slow).toHaveBeenCalledTimes(full ? 1 : 0);
    expect(getRuntimeCoinAdapter).not.toHaveBeenCalled();
    expect(reply).toMatchObject({ id: 1, ok: true, type: "self-test" });
    if (!("type" in reply) || reply.type !== "self-test")
      throw new Error("Missing self-test reply.");
    expect(reply.result.checks).toEqual([
      ...pathChecks,
      "Local search concurrency admission",
      "Local search range admission",
      "Local search complete ordered results",
      "Local search final job cancellation",
      ...(full ? ["Controlled full-only check"] : []),
    ]);
  });

  it("fails the worker report when a composed metadata known answer is wrong", async () => {
    const adapter = registry.getCoinAdapter("bitcoin-legacy");
    const local = vi.fn(runLocalSearchSelfTest);
    const reply = await workerSelfTest(false, {
      getRuntimeCoinAdapter: vi.fn(),
      runDerivationSelfTest: async () =>
        report(
          runBitcoinPathSelfTest({
            COIN_ADAPTERS: [{ ...adapter, pathPreview: () => "m/incorrect" }],
          }),
        ),
      startupSelfTests: [local],
    });
    expect(reply).toEqual({
      id: 1,
      ok: false,
      error: "Protocol metadata self-test failed: bitcoin-legacy path.",
    });
    expect(local).not.toHaveBeenCalled();
  });

  it.each([false, true])("propagates a shared search check failure with full=%s", async (full) => {
    const failure = new Error("Controlled local-search check failure.");
    vi.spyOn(searchChecks, "runLocalSearchSelfTest").mockRejectedValue(failure);
    const slow = vi.fn(() => report(["Controlled full-only check"]));
    const reply = await workerSelfTest(full, {
      getRuntimeCoinAdapter: vi.fn(),
      runDerivationSelfTest: async () => report([]),
      startupSelfTests: [runLocalSearchSelfTest],
      fullSelfTests: [slow],
    });
    expect(reply).toEqual({ id: 1, ok: false, error: failure.message });
    expect(slow).not.toHaveBeenCalled();
  });
});
