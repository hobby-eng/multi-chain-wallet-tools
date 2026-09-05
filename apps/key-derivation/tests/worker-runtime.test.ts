import { describe, expect, it, vi } from 'vitest';
import { startDerivationWorker } from '../src/workers/worker-runtime.js';
import type { WorkerMessage, WorkerRequest } from '../src/workers/protocol.js';

describe('derivation worker secret lifetime', () => {
  it.each(['derive', 'search'] as const)('clears the seed when %s adapter resolution fails', async (type) => {
    let listener: ((event: MessageEvent<WorkerRequest>) => void) | undefined;
    const messages: WorkerMessage[] = [];
    vi.stubGlobal('self', {
      addEventListener: (_type: 'message', callback: (event: MessageEvent<WorkerRequest>) => void) => {
        listener = callback;
      },
      postMessage: (message: WorkerMessage) => messages.push(message),
    });
    startDerivationWorker({
      getRuntimeCoinAdapter: () => {
        throw new Error('Unknown adapter');
      },
      runDerivationSelfTest: vi.fn(),
    });
    const seed = new Uint8Array(64).fill(0x5a);
    const input = { seed, network: 'mainnet' as const, account: 0, branch: 0 };
    const request: WorkerRequest = type === 'derive'
      ? { id: 1, type, adapterId: 'missing', input: { ...input, start: 0, count: 1 } }
      : { id: 1, type, adapterId: 'missing', input, expectedAddress: 'x', start: 0, count: 1 };

    listener?.({ data: request } as MessageEvent<WorkerRequest>);
    await vi.waitFor(() => expect(messages).toContainEqual({
      id: 1,
      ok: false,
      error: 'Unknown adapter',
    }));
    expect(seed.every((byte) => byte === 0)).toBe(true);
    vi.unstubAllGlobals();
  });
});
