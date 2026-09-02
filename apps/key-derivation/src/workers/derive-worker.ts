import { getRuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import { runDerivationSelfTest } from '@ckd/derivation-self-test';
import { findDerivedAddress } from '../address-search.js';
import type { WorkerMessage, WorkerRequest } from './protocol.js';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerRequest>) => void): void;
  postMessage(message: WorkerMessage): void;
}

const workerScope = self as unknown as WorkerScope;
workerScope.postMessage({ type: 'ready' });

workerScope.addEventListener('message', (event) => {
  const request = event.data;
  void (async () => {
    try {
      if (request.type === 'self-test') {
        const result = await runDerivationSelfTest();
        workerScope.postMessage({ id: request.id, ok: true, type: 'self-test', result });
        return;
      }
      const adapter = getRuntimeCoinAdapter(request.adapterId);
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
