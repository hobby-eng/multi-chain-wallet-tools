import {
  RECOVERY_EXPORT_REQUEST,
  RECOVERY_EXPORT_RESULT,
  type RecoveryExportBrokerFormat,
  type RecoveryExportBrokerResult,
} from './network-protocol.js';

const pending = new Map<string, {
  resolve(filename: string): void;
  reject(cause: Error): void;
  timer: ReturnType<typeof setTimeout>;
}>();
let sequence = 0;

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || typeof event.data !== 'object' || event.data === null) return;
    const result = event.data as Partial<RecoveryExportBrokerResult>;
    if (result.type !== RECOVERY_EXPORT_RESULT || typeof result.id !== 'string' || typeof result.ok !== 'boolean') return;
    const request = pending.get(result.id);
    if (request === undefined) return;
    pending.delete(result.id);
    clearTimeout(request.timer);
    if (result.ok && typeof result.filename === 'string') request.resolve(result.filename);
    else request.reject(new Error(typeof result.error === 'string' ? result.error : 'The isolated export broker rejected the report.'));
  });
}

/**
 * Sends report text to the trusted top-level shell. The Secret Vault cannot
 * create a URL or navigate/download by itself because its sandbox omits
 * allow-downloads and its CSP denies every network connection.
 */
export function requestRecoveryExport(text: string, format: RecoveryExportBrokerFormat): Promise<string> {
  if (typeof text !== 'string' || (format !== 'csv' && format !== 'json')) {
    return Promise.reject(new Error('Invalid recovery export request.'));
  }
  const id = `export-${++sequence}`;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Timed out while waiting for the isolated export broker.'));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ type: RECOVERY_EXPORT_REQUEST, id, format, text }, '*');
  });
}
