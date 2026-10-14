import { describe, expect, it, vi } from "vitest";
import { deriveAllBranches, runStreamedDerivation } from "../src/ui/streamed-derivation.js";
import type { DerivationResult } from "@ckd/core/types.js";

function result(start: number, count: number, id = "test"): DerivationResult {
  return {
    id,
    title: "Test",
    networkLabel: "Mainnet",
    pathTemplate: "m/test",
    basicSummary: [],
    summary: [],
    rows: Array.from({ length: count }, (_, offset) => ({
      index: start + offset,
      path: `m/test/${start + offset}`,
      title: `Row ${start + offset}`,
      basic: [],
      advanced: [],
    })),
    notices: [],
  };
}

const adapter = { id: "test", batchSize: 2 } as Parameters<
  typeof runStreamedDerivation
>[0]["adapter"];
const input = {
  network: "mainnet",
  account: 0,
  branch: 0,
  start: 0,
  count: 5,
  includeChange: false,
  includeCoinJoin: false,
} as Parameters<typeof runStreamedDerivation>[0]["input"];

describe("streamed derivation engine", () => {
  it("appends bounded batches and reports exact progress", async () => {
    const derive = vi.fn(async (_id: string, request: { start: number; count: number }) =>
      result(request.start, request.count),
    );
    let initial: DerivationResult | null = null;
    const appended: number[] = [];
    const progress: number[] = [];
    const outcome = await runStreamedDerivation({
      worker: { derive } as unknown as Parameters<typeof runStreamedDerivation>[0]["worker"],
      adapter,
      input,
      branches: [{ kind: "receive", branch: 0 }],
      seed: new Uint8Array(64),
      isStale: () => false,
      isCancelled: () => false,
      onInitialBatch: (_branch, value) => {
        initial = value;
      },
      onAppendedBatch: (_branch, rows) => appended.push(...rows.map(({ index }) => index)),
      onProgress: (_branch, _branchCount, total) => progress.push(total),
      yieldTurn: async () => {},
    });
    expect(outcome).toEqual({ generated: 5, stale: false, cancelled: false });
    expect(derive).toHaveBeenCalledTimes(3);
    expect(initial).not.toBeNull();
    expect((initial as unknown as DerivationResult).rows.map(({ index }) => index)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(appended).toEqual([2, 3, 4]);
    expect(progress).toEqual([2, 4, 5]);
  });

  it("wipes a response that becomes stale before it can be committed", async () => {
    const batch = result(0, 2);
    batch.rows[0]!.advanced.push({
      key: "privateKey",
      label: "Private key",
      value: "secret",
      secret: true,
    });
    let stale = false;
    const outcome = await runStreamedDerivation({
      worker: {
        derive: vi.fn(async () => {
          stale = true;
          return batch;
        }),
      } as unknown as Parameters<typeof runStreamedDerivation>[0]["worker"],
      adapter,
      input: { ...input, count: 2 },
      branches: [{ kind: "receive", branch: 0 }],
      seed: new Uint8Array(64),
      isStale: () => stale,
      isCancelled: () => false,
      onInitialBatch: vi.fn(),
      onAppendedBatch: vi.fn(),
      onProgress: vi.fn(),
      yieldTurn: async () => {},
    });
    expect(outcome.stale).toBe(true);
    expect(batch.rows).toHaveLength(0);
  });

  it("rejects an inconsistent later batch and clears that batch", async () => {
    const batches = [result(0, 2, "first"), result(2, 2, "wrong")];
    await expect(
      runStreamedDerivation({
        worker: { derive: vi.fn(async () => batches.shift()!) } as unknown as Parameters<
          typeof runStreamedDerivation
        >[0]["worker"],
        adapter,
        input: { ...input, count: 4 },
        branches: [{ kind: "receive", branch: 0 }],
        seed: new Uint8Array(64),
        isStale: () => false,
        isCancelled: () => false,
        onInitialBatch: vi.fn(),
        onAppendedBatch: vi.fn(),
        onProgress: vi.fn(),
        yieldTurn: async () => {},
      }),
    ).rejects.toThrow(/inconsistent streamed batch/u);
    expect(batches).toHaveLength(0);
  });
});

describe("every branch at once, in bounded batches (AUD-024-FUN001)", () => {
  /** A worker that refuses more than 50 results a call, as the derivation worker does. */
  function boundedWorker(failAt?: number) {
    const calls: number[] = [];
    const derive = vi.fn(async (_id: string, request: { start: number; count: number }) => {
      if (!Number.isInteger(request.count) || request.count < 1 || request.count > 50)
        throw new Error("Number of results must be an integer from 1 to 50.");
      calls.push(request.count);
      if (failAt === calls.length) throw new Error("synthetic worker failure");
      return result(request.start, request.count);
    });
    const worker = { derive } as unknown as Parameters<typeof runStreamedDerivation>[0]["worker"];
    return { worker, calls };
  }
  const unbounded = { id: "test" } as Parameters<typeof runStreamedDerivation>[0]["adapter"];

  for (const [count, batches] of [
    [50, [50]],
    [51, [50, 1]],
    [200, [50, 50, 50, 50]],
  ] as const)
    it(`derives ${count} results a branch in batches of at most 50`, async () => {
      const { worker, calls } = boundedWorker();
      const results = await deriveAllBranches({
        worker,
        adapter: unbounded,
        input: { ...input, count },
        branches: [
          { kind: "receive", branch: 0 },
          { kind: "change", branch: 1 },
        ],
        seed: new Uint8Array(64),
        isStale: () => false,
      });
      expect(calls).toEqual([...batches, ...batches]);
      expect(results?.get("receive")?.rows.map(({ index }) => index)).toEqual(
        Array.from({ length: count }, (_, index) => index),
      );
      expect(results?.get("change")?.rows).toHaveLength(count);
    });

  it("gives nothing for a stale request and keeps nothing after a failure", async () => {
    let stale = false;
    const staleWorker = boundedWorker();
    const staleResults = deriveAllBranches({
      worker: staleWorker.worker,
      adapter: unbounded,
      input: { ...input, count: 120 },
      branches: [{ kind: "receive", branch: 0 }],
      seed: new Uint8Array(64),
      isStale: () => stale,
    });
    stale = true;
    await expect(staleResults).resolves.toBeUndefined();

    const failing = boundedWorker(3);
    await expect(
      deriveAllBranches({
        worker: failing.worker,
        adapter: unbounded,
        input: { ...input, count: 120 },
        branches: [{ kind: "receive", branch: 0 }],
        seed: new Uint8Array(64),
        isStale: () => false,
      }),
    ).rejects.toThrow("synthetic worker failure");
  });
});
