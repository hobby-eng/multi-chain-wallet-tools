import type { CoinDerivationInput } from '@ckd/coins/registry.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import type { DerivationResult } from '@ckd/core/types.js';
import type { AddressSearchMatch, MessageSigningFormat, WorkerMessage, WorkerRequest } from './protocol.js';
import type { CompactMessageSignature } from '@ckd/core/compact-message.js';
import type { SilentPaymentResult } from './silent-payment.js';
import type { Bip85RequestOptions, Bip85Result } from './bip85-deriver.js';
import type { Bip38EncryptionResult } from './protocol.js';

declare const __DERIVATION_WORKER_SOURCE__: string;

interface PendingRequest {
  resolve(value: DerivationResult | CryptoSelfTestReport | AddressSearchMatch | CompactMessageSignature | SilentPaymentResult | Bip85Result | Bip38EncryptionResult | null): void;
  reject(reason: Error): void;
}

interface QueuedRequest {
  readonly request: WorkerRequest;
  readonly transfer: readonly Transferable[];
}

interface ReadyWaiter {
  resolve(): void;
  reject(reason: Error): void;
}

type WorkerLifecycle = 'booting' | 'ready' | 'terminated';

export class DerivationCancelledError extends Error {
  constructor(message = 'Derivation cancelled.') {
    super(message);
    this.name = 'DerivationCancelledError';
  }
}

export class DerivationWorkerClient {
  readonly #worker: Worker;
  readonly #pending = new Map<number, PendingRequest>();
  readonly #queued = new Map<number, QueuedRequest>();
  readonly #readyWaiters = new Set<ReadyWaiter>();
  #nextId = 1;
  #lifecycle: WorkerLifecycle = 'booting';
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
        if (this.#lifecycle === 'booting') {
          this.#revokeWorkerUrl();
          this.#lifecycle = 'ready';
          for (const waiter of this.#readyWaiters) waiter.resolve();
          this.#readyWaiters.clear();
          for (const queued of this.#queued.values()) this.#post(queued);
          this.#queued.clear();
        } else if (this.#lifecycle === 'terminated') {
          this.#worker.terminate();
          this.#revokeWorkerUrl();
        }
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
      const failure = new Error(event.message || 'The derivation worker stopped unexpectedly.');
      this.#lifecycle = 'terminated';
      this.#wipeQueued();
      this.#revokeWorkerUrl();
      this.#rejectAll(failure);
      for (const waiter of this.#readyWaiters) waiter.reject(failure);
      this.#readyWaiters.clear();
    });
  }


  ready(): Promise<void> {
    if (this.#lifecycle === 'ready') return Promise.resolve();
    if (this.#lifecycle === 'terminated') return Promise.reject(new Error('The derivation worker is no longer available.'));
    return new Promise<void>((resolve, reject) => {
      this.#readyWaiters.add({ resolve, reject });
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

  async signMessage(
    adapterId: string,
    input: CoinDerivationInput,
    address: string,
    message: string,
    format: MessageSigningFormat,
  ): Promise<CompactMessageSignature> {
    const seed = input.seed.slice();
    return this.#request<CompactMessageSignature>({
      id: this.#nextId,
      type: 'sign-message',
      adapterId,
      input: { ...input, seed },
      address,
      message,
      format,
    }, [seed.buffer]);
  }

  async deriveSilentPayment(
    seedInput: Uint8Array,
    network: 'mainnet' | 'testnet',
    account: number,
    labelIndexes?: readonly number[],
  ): Promise<SilentPaymentResult> {
    const seed = seedInput.slice();
    return this.#request<SilentPaymentResult>({
      id: this.#nextId,
      type: 'silent-payment',
      seed,
      network,
      account,
      ...(labelIndexes === undefined ? {} : { labelIndexes }),
    }, [seed.buffer]);
  }

  async deriveBip85(seedInput: Uint8Array, options: Bip85RequestOptions): Promise<Bip85Result> {
    const seed = seedInput.slice();
    return this.#request<Bip85Result>({
      id: this.#nextId,
      type: 'bip85',
      seed,
      options,
    }, [seed.buffer]);
  }

  async encryptBip38(
    adapterId: string,
    input: CoinDerivationInput,
    address: string,
    passphrase: string,
  ): Promise<Bip38EncryptionResult> {
    const seed = input.seed.slice();
    return this.#request<Bip38EncryptionResult>({
      id: this.#nextId,
      type: 'bip38-encrypt',
      adapterId,
      input: { ...input, seed },
      address,
      passphrase,
    }, [seed.buffer]);
  }

  terminate(reason = new DerivationCancelledError()): void {
    if (this.#lifecycle === 'terminated') return;
    const ready = this.#lifecycle === 'ready';
    this.#lifecycle = 'terminated';
    this.#wipeQueued();
    this.#rejectAll(reason);
    for (const waiter of this.#readyWaiters) waiter.reject(reason);
    this.#readyWaiters.clear();
    if (ready) {
      this.#worker.terminate();
      this.#revokeWorkerUrl();
    }
  }

  #revokeWorkerUrl(): void {
    if (this.#workerUrlTimer !== null) globalThis.clearTimeout(this.#workerUrlTimer);
    this.#workerUrlTimer = null;
    if (this.#workerUrl === null) return;
    URL.revokeObjectURL(this.#workerUrl);
    this.#workerUrl = null;
  }

  #request<T extends DerivationResult | CryptoSelfTestReport | AddressSearchMatch | CompactMessageSignature | SilentPaymentResult | Bip85Result | Bip38EncryptionResult | null>(
    request: WorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<T> {
    if (this.#lifecycle === 'terminated') {
      this.#wipeRequest(request);
      return Promise.reject(new Error('The derivation worker is no longer available.'));
    }
    this.#nextId += 1;
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(request.id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      const queued = { request, transfer };
      if (this.#lifecycle === 'ready') this.#post(queued);
      else this.#queued.set(request.id, queued);
    });
  }

  #post(queued: QueuedRequest): void {
    try {
      this.#worker.postMessage(queued.request, [...queued.transfer]);
    } catch (cause) {
      this.#wipeRequest(queued.request);
      const pending = this.#pending.get(queued.request.id);
      this.#pending.delete(queued.request.id);
      pending?.reject(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  #wipeRequest(request: WorkerRequest): void {
    if ('seed' in request) request.seed.fill(0);
    if ('input' in request) request.input.seed.fill(0);
  }

  #wipeQueued(): void {
    for (const queued of this.#queued.values()) this.#wipeRequest(queued.request);
    this.#queued.clear();
  }

  #rejectAll(reason: Error): void {
    for (const pending of this.#pending.values()) pending.reject(reason);
    this.#pending.clear();
  }
}
