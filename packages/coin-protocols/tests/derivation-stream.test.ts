import { describe, expect, it, vi } from "vitest";
import {
  DerivationStream,
  type DerivationBatchWorker,
  type DerivationStreamCallbacks,
} from "../src/coins/derivation-stream.js";
import type { DerivationParameters } from "../src/coins/derivation-request.js";
import { DerivationResultFixture } from "@ckd/test-support/derivation-result.js";
import { DerivationSecrets } from "@ckd/core/secrets.js";

it("discards every collected result despite a native cleanup failure in the first branch", () => {
  const first = DerivationResultFixture.create();
  const second = DerivationResultFixture.create();
  DerivationResultFixture.refusePublicWrite(first, "readonly");
  const fields = [first.rows[0]!.advanced[0]!, second.rows[0]!.advanced[0]!];
  const collected = new Map([
    ["receive" as const, DerivationSecrets.take(first)],
    ["change" as const, DerivationSecrets.take(second)],
  ]);
  expect(() => DerivationStream.discard(collected)).toThrow(
    expect.objectContaining({ code: "derivation.result.property" }),
  );
  expect(fields.every((field) => field.value === "")).toBe(true);
  expect(collected.size).toBe(0);
});

type RunOptions = ConstructorParameters<typeof DerivationStream>[0] &
  Parameters<DerivationStream["run"]>[1] & { seed: Uint8Array };

// Test adapters keep the old scenario fixtures while invoking the real class and its narrow port.
function runStreamedDerivation({
  worker,
  adapter,
  input,
  branches,
  seed,
  ...callbacks
}: RunOptions) {
  return new DerivationStream({ worker, adapter, input, branches }).run(seed, callbacks);
}

function deriveAllBranches({
  seed,
  isStale,
  ...settings
}: ConstructorParameters<typeof DerivationStream>[0] & {
  seed: Uint8Array;
  isStale: () => boolean;
}) {
  return new DerivationStream(settings).all(seed, { isStale, yieldTurn: async () => {} });
}
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

const adapter = { id: "test", batchSize: 2 };
const input: DerivationParameters = {
  network: "mainnet",
  account: 0,
  branch: 0,
  start: 0,
  count: 5,
  includeChange: false,
  includeCoinJoin: false,
};

function callbacks(overrides: Partial<DerivationStreamCallbacks> = {}): DerivationStreamCallbacks {
  return {
    isStale: () => false,
    isCancelled: () => false,
    onInitialBatch: () => undefined,
    onAppendedBatch: () => undefined,
    onProgress: () => undefined,
    yieldTurn: async () => {},
    ...overrides,
  };
}

function privateBatch(start: number): DerivationResult {
  return {
    ...result(start, 2),
    summary: [{ key: "key", label: "Key", value: "synthetic key", secret: true }],
    accountDescriptors: {
      accountPath: "m/test",
      publicText: "synthetic public",
      privateText: "synthetic private",
      scannerText: "synthetic scanner",
      fileStem: "test",
    },
  };
}

describe("streamed derivation engine", () => {
  it("refuses an incomplete first batch before publication", async () => {
    const initial = vi.fn();
    await expect(
      runStreamedDerivation({
        worker: { derive: async () => result(0, 1) },
        adapter,
        input: { ...input, count: 2 },
        branches: [{ kind: "receive", branch: 0 }],
        seed: new Uint8Array(64),
        isStale: () => false,
        isCancelled: () => false,
        onInitialBatch: initial,
        onAppendedBatch: vi.fn(),
        onProgress: vi.fn(),
        yieldTurn: async () => {},
      }),
    ).rejects.toMatchObject({ code: "derivation.stream.batch" });
    expect(initial).not.toHaveBeenCalled();
  });

  it("captures the requested count before a worker await", async () => {
    const mutable = { ...input };
    const derive = vi.fn(async (_id: string, request: { start: number; count: number }) => {
      mutable.count = 1;
      return result(request.start, request.count);
    });
    const outcome = await runStreamedDerivation({
      worker: { derive },
      adapter,
      input: mutable,
      branches: [{ kind: "receive", branch: 0 }],
      seed: new Uint8Array(64),
      isStale: () => false,
      isCancelled: () => false,
      onInitialBatch: vi.fn(),
      onAppendedBatch: vi.fn(),
      onProgress: vi.fn(),
      yieldTurn: async () => {},
    });
    expect(outcome.generated).toBe(5);
    expect(derive).toHaveBeenCalledTimes(3);
  });

  it("appends bounded batches and reports exact progress", async () => {
    const derive = vi.fn(async (_id: string, request: { start: number; count: number }) =>
      result(request.start, request.count),
    );
    const initial: DerivationResult[] = [];
    const appended: number[] = [];
    const progress: number[] = [];
    const outcome = await runStreamedDerivation({
      worker: { derive },
      adapter,
      input,
      branches: [{ kind: "receive", branch: 0 }],
      seed: new Uint8Array(64),
      isStale: () => false,
      isCancelled: () => false,
      onInitialBatch: (_branch, value) => {
        initial.push(value);
      },
      onAppendedBatch: (_branch, rows) => appended.push(...rows.map(({ index }) => index)),
      onProgress: (_branch, _branchCount, total) => progress.push(total),
      yieldTurn: async () => {},
    });
    expect(outcome).toEqual({ generated: 5, stale: false, cancelled: false });
    expect(derive).toHaveBeenCalledTimes(3);
    expect(initial).toHaveLength(1);
    expect(initial[0]?.rows.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4]);
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
      },
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
    const refused = privateBatch(2);
    refused.id = "wrong";
    const batches = [result(0, 2, "first"), refused];
    await expect(
      runStreamedDerivation({
        worker: { derive: vi.fn(async () => batches.shift()!) },
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
    ).rejects.toMatchObject({ code: "derivation.stream.batch" });
    expect(batches).toHaveLength(0);
    expect(refused.rows).toEqual([]);
    expect(refused.accountDescriptors?.privateText).toBe("");
  });
});

describe("stream ownership and cancellation", () => {
  it("clears a late cancelled batch while retaining the published partial result and borrowed seed", async () => {
    const first = privateBatch(0);
    const late = privateBatch(2);
    const seed = new Uint8Array(64).fill(7);
    let cancelled = false;
    let calls = 0;
    const stream = new DerivationStream({
      worker: {
        derive: async () => {
          if (++calls === 1) return first;
          cancelled = true;
          return late;
        },
      },
      adapter,
      input: { ...input, count: 4 },
      branches: [{ kind: "receive", branch: 0 }],
    });
    const progress = vi.fn();
    await expect(
      stream.run(seed, callbacks({ isCancelled: () => cancelled, onProgress: progress })),
    ).resolves.toEqual({ generated: 2, stale: false, cancelled: true });
    expect(first.rows).toHaveLength(2);
    expect(first.accountDescriptors?.privateText).toBe("synthetic private");
    expect(late.rows).toEqual([]);
    expect(late.summary).toEqual([]);
    expect(late.accountDescriptors?.privateText).toBe("");
    expect(progress).toHaveBeenCalledTimes(1);
    expect(seed).toEqual(new Uint8Array(64).fill(7));
  });

  it("clears appended metadata if the host callback fails and leaves transferred rows with their owner", async () => {
    const first = privateBatch(0);
    const appended = privateBatch(2);
    let calls = 0;
    const stream = new DerivationStream({
      worker: { derive: async () => (++calls === 1 ? first : appended) },
      adapter,
      input: { ...input, count: 4 },
      branches: [{ kind: "receive", branch: 0 }],
    });
    const failure = new Error("synthetic host failure");
    await expect(
      stream.run(
        new Uint8Array(64),
        callbacks({
          onAppendedBatch: () => {
            throw failure;
          },
        }),
      ),
    ).rejects.toBe(failure);
    expect(first.rows.map(({ index }) => index)).toEqual([0, 1, 2, 3]);
    expect(appended.rows).toEqual([]);
    expect(appended.summary).toEqual([]);
    expect(appended.accountDescriptors?.privateText).toBe("");
  });

  it("clears every collected branch on failure", async () => {
    const collected = privateBatch(0);
    let calls = 0;
    const stream = new DerivationStream({
      worker: {
        derive: async () => {
          if (++calls === 1) return collected;
          throw new Error("synthetic worker failure");
        },
      },
      adapter,
      input: { ...input, count: 2 },
      branches: [
        { kind: "receive", branch: 0 },
        { kind: "change", branch: 1 },
      ],
    });
    await expect(stream.all(new Uint8Array(64), callbacks())).rejects.toThrow(
      "synthetic worker failure",
    );
    expect(collected.rows).toEqual([]);
    expect(collected.accountDescriptors?.privateText).toBe("");
  });

  it("refuses concurrent runs and releases the guard after settling", async () => {
    let resolve: (result: DerivationResult) => void = () => {
      throw new Error("The public worker fixture has not started.");
    };
    const pending = new Promise<DerivationResult>((done) => {
      resolve = done;
    });
    const stream = new DerivationStream({
      worker: { derive: () => pending },
      adapter,
      input: { ...input, count: 2 },
      branches: [{ kind: "receive", branch: 0 }],
    });
    const running = stream.run(new Uint8Array(64), callbacks());
    await expect(stream.run(new Uint8Array(64), callbacks())).rejects.toMatchObject({
      code: "derivation.stream.active",
    });
    resolve(result(0, 2));
    await expect(running).resolves.toEqual({ generated: 2, stale: false, cancelled: false });
    await expect(
      stream.run(new Uint8Array(64), callbacks({ isCancelled: () => true })),
    ).resolves.toEqual({ generated: 0, stale: false, cancelled: true });
  });

  it.each([0, -1, NaN, Infinity, 1.5])("refuses invalid batch size %s", (batchSize) => {
    expect(
      () =>
        new DerivationStream({
          worker: { derive: async () => result(0, 2) },
          adapter: { ...adapter, batchSize },
          input,
          branches: [{ kind: "receive", branch: 0 }],
        }),
    ).toThrow(expect.objectContaining({ code: "derivation.stream.batch-size" }));
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
    const worker: DerivationBatchWorker = { derive };
    return { worker, calls };
  }
  const unbounded = { id: "test" };

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
