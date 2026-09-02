import type { CoinDerivationInput } from '@ckd/coins/registry.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import type { DerivationResult } from '@ckd/core/types.js';
import type { AddressSearchMatch, WorkerMessage, WorkerRequest } from './protocol.js';

declare const __DERIVATION_WORKER_SOURCE__: string;

interface PendingRequest {
  resolve(value: DerivationResult | CryptoSelfTestReport | AddressSearchMatch | null): void;
  reject(reason: Error): void;
}

export class DerivationCancelledError extends Error {
  constructor(message = 'Derivation cancelled.') {
    super(message);
    this.name = 'DerivationCancelledError';
  }
}

export class DerivationWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingRequest>();
  #nextId = 1;
  #terminated = false;
  #workerUrl: string | null;
  #workerUrlTimer: ReturnType<typeof globalThis.setTimeout> | null;

  constructor() {
    if (typeof Worker === 'undefined') throw new Error('This browser does not support Web Workers.');
    const blob = new Blob([__DERIVATION_WORKER_SOURCE__], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    this.#workerUrl = url;
    this.#worker = new Worker(url, { name: 'wallet-key-derivation' });
    // Revocation is safe only after the worker confirms its script loaded.
    // The timeout is a leak-prevention fallback for a browser that never emits
    // either ready or error; it is deliberately not the normal path.
    this.#workerUrlTimer = globalThis.setTimeout(() => this.#revokeWorkerUrl(), 15_000);
    this.#worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const response = event.data;
      if (!('id' in response)) {
        this.#revokeWorkerUrl();
        return;
      }
      const pending = this.#pending.get(response.id);
      if (pending === undefined) return;
      this.#pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error));
    });
    this.#worker.addEventListener('error', (event) => {
      // The worker is gone: without marking the client terminated, a later
      // request would post to a dead worker and never settle, leaving the UI
      // stuck on "Deriving…" with no timeout to release it.
      this.#terminated = true;
      this.#revokeWorkerUrl();
      this.#rejectAll(new Error(event.message || 'The derivation worker stopped unexpectedly.'));
    });
  }

  async derive(adapterId: string, input: CoinDerivationInput): Promise<DerivationResult> {
    const seed = input.seed.slice();
    return this.#request<DerivationResult>(
      { id: this.#nextId, type: 'derive', adapterId, input: { ...input, seed } },
      [seed.buffer],
    );
  }

  async selfTest(): Promise<CryptoSelfTestReport> {
    return this.#request<CryptoSelfTestReport>({ id: this.#nextId, type: 'self-test' });
  }

  async search(
    adapterId: string,
    input: Omit<CoinDerivationInput, 'start' | 'count'>,
    expectedAddress: string,
    start: number,
    count: number,
  ): Promise<AddressSearchMatch | null> {
    const seed = input.seed.slice();
    return this.#request<AddressSearchMatch | null>({
      id: this.#nextId,
      type: 'search',
      adapterId,
      input: { ...input, seed },
      expectedAddress,
      start,
      count,
    }, [seed.buffer]);
  }

  terminate(reason = new DerivationCancelledError()): void {
    if (this.#terminated) return;
    this.#terminated = true;
    this.#worker.terminate();
    this.#revokeWorkerUrl();
    this.#rejectAll(reason);
  }

  #revokeWorkerUrl(): void {
    if (this.#workerUrlTimer !== null) globalThis.clearTimeout(this.#workerUrlTimer);
    this.#workerUrlTimer = null;
    if (this.#workerUrl === null) return;
    URL.revokeObjectURL(this.#workerUrl);
    this.#workerUrl = null;
  }

  #request<T extends DerivationResult | CryptoSelfTestReport | AddressSearchMatch | null>(
    request: WorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (this.#terminated) return Promise.reject(new Error('The derivation worker is no longer available.'));
    this.#nextId += 1;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(request.id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.#worker.postMessage(request, transfer);
    });
  }

  #rejectAll(reason: Error): void {
    for (const pending of this.#pending.values()) pending.reject(reason);
    this.#pending.clear();
  }
}
