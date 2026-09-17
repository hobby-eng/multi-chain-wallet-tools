import {
  RECOVERY_NETWORK_ATTACH,
  RECOVERY_NETWORK_READY,
  type RecoveryNetworkApi,
  type RecoveryNetworkPortMessage,
  type RecoveryNetworkRequest,
  type RecoveryNetworkResponse,
} from './protocol.js';

type NetworkRequestExecutor<Service = RecoveryNetworkApi> = (
  service: Service,
  request: RecoveryNetworkRequest,
  signal: AbortSignal,
) => Promise<unknown>;

type NetworkRequestValidator = (value: unknown) => RecoveryNetworkRequest;

export function startNetworkBoundaryWorker<Service>(
  service: Service,
  execute: NetworkRequestExecutor<Service>,
  validate: NetworkRequestValidator,
  formatError: (cause: unknown) => string = (cause) => (cause instanceof Error ? cause.message : String(cause)),
): void {
  const controllers = new Map<string, AbortController>();
  let attached = false;
  const attach = (port: MessagePort): void => {
    if (attached) throw new Error('Network boundary accepts exactly one channel.');
    attached = true;
    port.addEventListener('message', (event: MessageEvent<unknown>) => {
      const message = event.data as (Partial<RecoveryNetworkPortMessage> & { request?: unknown }) | null;
      if (typeof message !== 'object' || message === null || (message.type !== 'cancel' && message.type !== 'invoke'))
        return;
      if (message.type === 'cancel') {
        if (typeof message.id === 'string') controllers.get(message.id)?.abort();
        return;
      }
      const candidate = message.request as { id?: unknown } | null;
      const candidateId = typeof candidate?.id === 'string' ? candidate.id : undefined;
      let request: RecoveryNetworkRequest;
      try {
        request = validate(message.request);
      } catch (cause) {
        if (candidateId !== undefined) {
          port.postMessage({
            id: candidateId,
            ok: false,
            error: formatError(cause),
          } satisfies RecoveryNetworkResponse);
        }
        return;
      }
      const requestId = request.id;
      if (controllers.has(requestId)) {
        port.postMessage({
          id: requestId,
          ok: false,
          error: 'Duplicate network request identifier.',
        } satisfies RecoveryNetworkResponse);
        return;
      }
      const controller = new AbortController();
      controllers.set(requestId, controller);
      void execute(service, request as RecoveryNetworkRequest, controller.signal)
        .then((value) => port.postMessage({ id: requestId, ok: true, value } satisfies RecoveryNetworkResponse))
        .catch((cause) =>
          port.postMessage({ id: requestId, ok: false, error: formatError(cause) } satisfies RecoveryNetworkResponse),
        )
        .finally(() => controllers.delete(requestId));
    });
    port.start();
  };
  globalThis.addEventListener('message', (event: MessageEvent<{ type?: unknown }>) => {
    if (event.data?.type !== RECOVERY_NETWORK_ATTACH) return;
    const port = event.ports[0];
    if (port === undefined) throw new Error('Network boundary did not receive its MessagePort.');
    attach(port);
    globalThis.postMessage({ type: RECOVERY_NETWORK_READY });
  });
}
