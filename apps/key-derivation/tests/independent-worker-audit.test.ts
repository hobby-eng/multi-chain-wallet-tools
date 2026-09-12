import { afterEach, describe, expect, it, vi } from 'vitest';
import { DerivationCancelledError, DerivationWorkerClient } from '../src/workers/derive-client.js';
import type { WorkerMessage, WorkerRequest } from '../src/workers/protocol.js';

class FakeWorker {
  static latest: FakeWorker;
  readonly requests: WorkerRequest[] = [];
  readonly listeners = new Map<string, (event: { data?: WorkerMessage; message?: string }) => void>();
  readonly terminate = vi.fn();
  constructor() { FakeWorker.latest = this; }
  addEventListener(type: string, listener: (event: { data?: WorkerMessage; message?: string }) => void): void {
    this.listeners.set(type, listener);
  }
  postMessage(request: WorkerRequest): void { this.requests.push(request); }
  reply(message: WorkerMessage): void { this.listeners.get('message')!({ data: message }); }
}

function client(ready = true): DerivationWorkerClient {
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('__DERIVATION_WORKER_SOURCE__', '');
  const result = new DerivationWorkerClient();
  if (ready) FakeWorker.latest.reply({ type: 'ready' });
  return result;
}

afterEach(() => vi.unstubAllGlobals());

describe('derivation worker readiness contract', () => {
  it('queues sensitive requests until the worker reports ready', async () => {
    const worker = client(false);
    const ready = worker.ready();
    const result = worker.deriveBip85(new Uint8Array(64).fill(3), { application: 'hex', bytes: 16, index: 0 });
    expect(FakeWorker.latest.requests).toEqual([]);
    FakeWorker.latest.reply({ type: 'ready' });
    await expect(ready).resolves.toBeUndefined();
    expect(FakeWorker.latest.requests).toHaveLength(1);
    FakeWorker.latest.reply({ id: 1, ok: true, type: 'bip85', result: { kind: 'hex', path: 'ready', value: '03' } });
    await expect(result).resolves.toMatchObject({ path: 'ready' });
    worker.terminate();
  });

  it('cancels before ready without posting secrets or terminating a booting worker', async () => {
    const worker = client(false);
    const ready = worker.ready();
    const result = worker.deriveBip85(new Uint8Array(64).fill(4), { application: 'hex', bytes: 16, index: 0 });
    const rejectedReady = expect(ready).rejects.toBeInstanceOf(DerivationCancelledError);
    const rejectedResult = expect(result).rejects.toBeInstanceOf(DerivationCancelledError);
    worker.terminate();
    expect(FakeWorker.latest.requests).toEqual([]);
    expect(FakeWorker.latest.terminate).not.toHaveBeenCalled();
    await Promise.all([rejectedReady, rejectedResult]);
    FakeWorker.latest.reply({ type: 'ready' });
    expect(FakeWorker.latest.requests).toEqual([]);
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
});

describe('independent derivation worker lifecycle audit', () => {
  it('correlates out-of-order replies rather than the current request', async () => {
    const worker = client();
    try {
      const first = worker.deriveBip85(new Uint8Array(64).fill(1), { application: 'hex', bytes: 16, index: 0 });
      const second = worker.deriveBip85(new Uint8Array(64).fill(2), { application: 'hex', bytes: 16, index: 1 });
      const ids = FakeWorker.latest.requests.map(request => request.id);
      FakeWorker.latest.reply({ id: ids[1]!, ok: true, type: 'bip85', result: { kind: 'hex', path: 'second', value: '02' } });
      FakeWorker.latest.reply({ id: ids[0]!, ok: true, type: 'bip85', result: { kind: 'hex', path: 'first', value: '01' } });
      await expect(first).resolves.toMatchObject({ path: 'first' });
      await expect(second).resolves.toMatchObject({ path: 'second' });
    } finally { worker.terminate(); }
  });

  it('rejects every pending request on cancellation and ignores stale success replies', async () => {
    const worker = client();
    const seed = new Uint8Array(64).fill(7);
    const first = worker.deriveBip85(seed, { application: 'hex', bytes: 16, index: 0 });
    const second = worker.deriveSilentPayment(seed, 'mainnet', 0);
    const firstRejected = expect(first).rejects.toBeInstanceOf(DerivationCancelledError);
    const secondRejected = expect(second).rejects.toBeInstanceOf(DerivationCancelledError);
    worker.terminate();
    FakeWorker.latest.reply({ id: 1, ok: true, type: 'bip85', result: { kind: 'hex', path: 'stale', value: '00' } });
    await Promise.all([firstRejected, secondRejected]);
    expect(seed).toEqual(new Uint8Array(64).fill(7));
    expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
    await expect(worker.selfTest()).rejects.toThrow('no longer available');
  });

  it('rejects pending and future requests after worker failure', async () => {
    const worker = client();
    const pending = worker.selfTest();
    const rejected = expect(pending).rejects.toThrow('public simulated crash');
    FakeWorker.latest.listeners.get('error')!({ message: 'public simulated crash' });
    await rejected;
    await expect(worker.selfTest()).rejects.toThrow('no longer available');
  });
});
