import {
  RECOVERY_NETWORK_ATTACH,
  RECOVERY_NETWORK_READY,
  type RecoveryNetworkPortMessage,
  type RecoveryNetworkRequest,
  type RecoveryNetworkResponse,
} from './network-protocol.js';
import { DirectRecoveryNetworkService, executeRecoveryNetworkRequest } from './network-service.js';
import { describeUnknownError, freeThrownValue } from './error-message.js';

interface WorkerAttachMessage {
  type: typeof RECOVERY_NETWORK_ATTACH;
}

const service = new DirectRecoveryNetworkService();
const controllers = new Map<string, AbortController>();
let attached = false;

function errorMessage(cause: unknown): string {
  const message = describeUnknownError(cause);
  freeThrownValue(cause);
  return message;
}

function attach(port: MessagePort): void {
  if (attached) throw new Error('Recovery Network Worker accepts exactly one channel.');
  attached = true;
  port.addEventListener('message', (event: MessageEvent<unknown>) => {
    const message = event.data as (Partial<RecoveryNetworkPortMessage> & { request?: unknown }) | null;
    if (typeof message !== 'object' || message === null || (message.type !== 'cancel' && message.type !== 'invoke')) return;
    if (message.type === 'cancel') {
      if (typeof message.id === 'string') controllers.get(message.id)?.abort();
      return;
    }
    const request = message.request as Partial<RecoveryNetworkRequest> | null;
    if (typeof request !== 'object' || request === null || typeof request.id !== 'string') return;
    const requestId = request.id;
    if (controllers.has(requestId)) {
      port.postMessage({ id: requestId, ok: false, error: 'Duplicate recovery network request identifier.' } satisfies RecoveryNetworkResponse);
      return;
    }
    const controller = new AbortController();
    controllers.set(requestId, controller);
    void executeRecoveryNetworkRequest(service, request as RecoveryNetworkRequest, controller.signal).then((value) => {
      port.postMessage({ id: requestId, ok: true, value } satisfies RecoveryNetworkResponse);
    }).catch((cause: unknown) => {
      port.postMessage({ id: requestId, ok: false, error: errorMessage(cause) } satisfies RecoveryNetworkResponse);
    }).finally(() => {
      controllers.delete(requestId);
    });
  });
  port.start();
}

globalThis.addEventListener('message', (event: MessageEvent<WorkerAttachMessage>) => {
  if (event.data?.type !== RECOVERY_NETWORK_ATTACH) return;
  const port = event.ports[0];
  if (port === undefined) throw new Error('Recovery Network Worker did not receive its MessagePort.');
  attach(port);
  globalThis.postMessage({ type: RECOVERY_NETWORK_READY });
});
