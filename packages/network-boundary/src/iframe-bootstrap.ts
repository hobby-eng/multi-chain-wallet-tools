import { RECOVERY_VAULT_CHANNEL } from './protocol.js';

export interface IsolatedBoundaryBootstrap {
  stop(): void;
}

/**
 * Loads an opaque-origin workspace and gives it only the narrow network
 * MessagePort. The iframe's CSP remains responsible for denying direct network
 * and worker access; this helper deliberately grants no other capability.
 */
export function bootstrapIsolatedBoundary(
  frame: HTMLIFrameElement,
  html: string,
  port: MessagePort,
  onError: (cause: unknown) => void,
): IsolatedBoundaryBootstrap {
  let delivered = false;
  let closed = false;
  const deliver = (): void => {
    if (delivered) return;
    if (closed) throw new Error('The isolated boundary channel was closed before delivery.');
    const target = frame.contentWindow;
    if (target === null) throw new Error('The browser did not create the isolated boundary document.');
    delivered = true;
    target.postMessage({ type: RECOVERY_VAULT_CHANNEL }, '*', [port]);
  };
  const onLoad = (): void => {
    try {
      deliver();
    } catch (cause) {
      onError(cause);
    }
  };
  frame.addEventListener('load', onLoad);
  frame.srcdoc = html;
  return {
    stop(): void {
      frame.removeEventListener('load', onLoad);
      // Release the untransferred endpoint if unload wins the readiness race.
      if (!delivered && !closed) {
        closed = true;
        port.close();
      }
    },
  };
}
