import {
  RECOVERY_NETWORK_FATAL,
  RECOVERY_VAULT_CHANNEL,
  type IdentityLookupView,
  type PlatformAddressBatchView,
  type PlatformHistorySummaryView,
  type RecoveryNetworkApi,
  type RecoveryNetworkRequestInput,
  type RecoveryNetworkResponse,
  type ShieldedPageView,
} from './network-protocol.js';
import type { RecoveryNetwork } from './types.js';

interface PendingRequest {
  resolve(value: unknown): void;
  reject(cause: unknown): void;
  signal?: AbortSignal;
  abort?: () => void;
}

class RecoveryNetworkRpcClient implements RecoveryNetworkApi {
  readonly #pending = new Map<string, PendingRequest>();
  #sequence = 0;
  #closed = false;

  constructor(readonly port: MessagePort) {
    port.addEventListener('message', (event: MessageEvent<RecoveryNetworkResponse>) => this.#receive(event.data));
    port.addEventListener('messageerror', () => this.fail(new Error('Recovery Network Worker returned an unreadable message.')));
    port.start();
  }

  #receive(response: RecoveryNetworkResponse): void {
    if (typeof response !== 'object' || response === null || typeof response.id !== 'string' || typeof response.ok !== 'boolean') {
      this.fail(new Error('Recovery Network Worker returned a malformed envelope.'));
      return;
    }
    if (!response.ok && typeof response.error !== 'string') {
      this.fail(new Error('Recovery Network Worker returned a malformed error envelope.'));
      return;
    }
    const pending = this.#pending.get(response.id);
    if (pending === undefined) return;
    this.#pending.delete(response.id);
    if (pending.abort !== undefined) pending.signal?.removeEventListener('abort', pending.abort);
    if (response.ok) pending.resolve(response.value);
    else pending.reject(new Error(response.error));
  }

  fail(cause: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      if (pending.abort !== undefined) pending.signal?.removeEventListener('abort', pending.abort);
      pending.reject(cause);
    }
    this.#pending.clear();
    this.port.close();
  }

  #request<T>(request: RecoveryNetworkRequestInput, signal?: AbortSignal): Promise<T> {
    if (this.#closed) return Promise.reject(new Error('Recovery Network Worker is unavailable.'));
    if (signal?.aborted === true) return Promise.reject(new DOMException('Recovery network operation cancelled.', 'AbortError'));
    const id = `vault-${++this.#sequence}`;
    return new Promise<T>((resolve, reject) => {
      const pending: PendingRequest = { resolve: (value) => resolve(value as T), reject, ...(signal === undefined ? {} : { signal }) };
      if (signal !== undefined) {
        pending.abort = () => {
          if (!this.#pending.delete(id)) return;
          this.port.postMessage({ type: 'cancel', id });
          reject(new DOMException('Recovery network operation cancelled.', 'AbortError'));
        };
        signal.addEventListener('abort', pending.abort, { once: true });
      }
      this.#pending.set(id, pending);
      try {
        this.port.postMessage({ type: 'invoke', request: { ...request, id } });
      } catch (cause) {
        this.#pending.delete(id);
        if (pending.abort !== undefined) signal?.removeEventListener('abort', pending.abort);
        reject(cause);
      }
    });
  }

  ping(signal?: AbortSignal): Promise<string> {
    return this.#request({ operation: 'ping', payload: {} }, signal);
  }

  coreStatus(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    return this.#request({ operation: 'core.status', payload: { network } }, signal);
  }

  coreTip(network: RecoveryNetwork, signal?: AbortSignal): Promise<unknown> {
    return this.#request({ operation: 'core.tip', payload: { network } }, signal);
  }

  coreAddressInfo(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<unknown> {
    return this.#request({ operation: 'core.address-info', payload: { network, addresses } }, signal);
  }

  coreAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<unknown> {
    return this.#request({ operation: 'core.address-history', payload: { network, address } }, signal);
  }

  platformAddresses(network: RecoveryNetwork, addresses: string[], signal?: AbortSignal): Promise<PlatformAddressBatchView> {
    return this.#request({ operation: 'platform.addresses', payload: { network, addresses } }, signal);
  }

  platformAddressHistory(network: RecoveryNetwork, address: string, signal?: AbortSignal): Promise<PlatformHistorySummaryView> {
    return this.#request({ operation: 'platform.address-history', payload: { network, address } }, signal);
  }

  platformIdentityByPublicKeyHash(
    network: RecoveryNetwork,
    publicKeyHashHex: string,
    signal?: AbortSignal,
  ): Promise<IdentityLookupView> {
    return this.#request({ operation: 'platform.identity-by-public-key-hash', payload: { network, publicKeyHashHex } }, signal);
  }

  platformIdentityHistory(network: RecoveryNetwork, identifier: string, signal?: AbortSignal): Promise<PlatformHistorySummaryView> {
    return this.#request({ operation: 'platform.identity-history', payload: { network, identifier } }, signal);
  }

  shieldedPage(network: RecoveryNetwork, startPosition: string, count: number, signal?: AbortSignal): Promise<ShieldedPageView> {
    return this.#request({ operation: 'shielded.page', payload: { network, startPosition, count } }, signal);
  }
}

let activeClient: RecoveryNetworkRpcClient | undefined;
let resolveClient: ((client: RecoveryNetworkRpcClient) => void) | undefined;
let rejectClient: ((cause: Error) => void) | undefined;
let installed = false;
const clientPromise = new Promise<RecoveryNetworkRpcClient>((resolve, reject) => {
  resolveClient = resolve;
  rejectClient = reject;
});
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (!installed) rejectClient?.(new Error('Timed out while establishing the isolated Recovery Network Worker channel.'));
  }, 15_000);
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || typeof event.data !== 'object' || event.data === null) return;
    const message = event.data as { type?: unknown; message?: unknown };
    if (message.type === RECOVERY_NETWORK_FATAL) {
      const cause = new Error(typeof message.message === 'string' ? message.message : 'Recovery Network Worker failed.');
      activeClient?.fail(cause);
      rejectClient?.(cause);
      return;
    }
    if (message.type !== RECOVERY_VAULT_CHANNEL || installed) return;
    const port = event.ports[0];
    if (port === undefined) {
      rejectClient?.(new Error('The isolated Recovery vault did not receive its network channel.'));
      return;
    }
    installed = true;
    const client = new RecoveryNetworkRpcClient(port);
    activeClient = client;
    resolveClient?.(client);
  });
}

export function recoveryNetworkApi(): Promise<RecoveryNetworkApi> {
  return clientPromise;
}
