import { describe, expect, it, vi } from 'vitest';
import { runStreamedDerivation } from '../src/ui/streamed-derivation.js';
import type { DerivationResult } from '@ckd/core/types.js';

function result(start: number, count: number, id = 'test'): DerivationResult {
  return {
    id,
    title: 'Test',
    networkLabel: 'Mainnet',
    pathTemplate: 'm/test',
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

const adapter = { id: 'test', batchSize: 2 } as Parameters<typeof runStreamedDerivation>[0]['adapter'];
const input = {
  network: 'mainnet',
  account: 0,
  branch: 0,
  start: 0,
  count: 5,
  includeChange: false,
  includeCoinJoin: false,
} as Parameters<typeof runStreamedDerivation>[0]['input'];

describe('streamed derivation engine', () => {
  it('appends bounded batches and reports exact progress', async () => {
    const derive = vi.fn(async (_id: string, request: { start: number; count: number }) =>
      result(request.start, request.count),
    );
    let initial: DerivationResult | null = null;
    const appended: number[] = [];
    const progress: number[] = [];
    const outcome = await runStreamedDerivation({
      worker: { derive } as unknown as Parameters<typeof runStreamedDerivation>[0]['worker'],
      adapter,
      input,
      branches: [{ kind: 'receive', branch: 0 }],
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
    expect((initial as unknown as DerivationResult).rows.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4]);
    expect(appended).toEqual([2, 3, 4]);
    expect(progress).toEqual([2, 4, 5]);
  });

  it('wipes a response that becomes stale before it can be committed', async () => {
    const batch = result(0, 2);
    batch.rows[0]!.advanced.push({ key: 'privateKey', label: 'Private key', value: 'secret', secret: true });
    let stale = false;
    const outcome = await runStreamedDerivation({
      worker: {
        derive: vi.fn(async () => {
          stale = true;
          return batch;
        }),
      } as unknown as Parameters<typeof runStreamedDerivation>[0]['worker'],
      adapter,
      input: { ...input, count: 2 },
      branches: [{ kind: 'receive', branch: 0 }],
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

  it('rejects an inconsistent later batch and clears that batch', async () => {
    const batches = [result(0, 2, 'first'), result(2, 2, 'wrong')];
    await expect(
      runStreamedDerivation({
        worker: { derive: vi.fn(async () => batches.shift()!) } as unknown as Parameters<
          typeof runStreamedDerivation
        >[0]['worker'],
        adapter,
        input: { ...input, count: 4 },
        branches: [{ kind: 'receive', branch: 0 }],
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
