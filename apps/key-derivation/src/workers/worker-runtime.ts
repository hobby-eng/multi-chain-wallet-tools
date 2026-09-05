import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import type { CryptoSelfTestReport } from '@ckd/self-test-types';
import { findDerivedAddress } from '../address-search.js';
import type { WorkerMessage, WorkerRequest } from './protocol.js';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerMessage): void;
}

interface WorkerDependencies {
  getRuntimeCoinAdapter(id: string): RuntimeCoinAdapter;
  runDerivationSelfTest(): Promise<CryptoSelfTestReport>;
}

export function startDerivationWorker(dependencies: WorkerDependencies): void {
  const workerScope = self as unknown as WorkerScope;
  workerScope.postMessage({ type: 'ready' });

  workerScope.addEventListener('message', (event) => {
    const request = event.data;
    void (async () => {
      try {
        if (request.type === 'self-test') {
          const result = await dependencies.runDerivationSelfTest();
          workerScope.postMessage({ id: request.id, ok: true, type: 'self-test', result });
          return;
        }
        const adapter = dependencies.getRuntimeCoinAdapter(request.adapterId);
        if (request.type === 'search') {
          try {
            const result = await findDerivedAddress(
              adapter,
              request.input,
              request.expectedAddress,
              request.start,
              request.count,
            );
            workerScope.postMessage({ id: request.id, ok: true, type: 'search', result });
          } finally {
            request.input.seed.fill(0);
          }
          return;
        }
        try {
          const result = await adapter.derive(request.input);
          workerScope.postMessage({ id: request.id, ok: true, type: 'derive', result });
        } finally {
          request.input.seed.fill(0);
        }
      } catch (cause) {
        workerScope.postMessage({
          id: request.id,
          ok: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    })();
  });
}
