import {
  RECOVERY_EXPORT_REQUEST,
  RECOVERY_EXPORT_RESULT,
  RECOVERY_NETWORK_ATTACH,
  RECOVERY_NETWORK_FATAL,
  RECOVERY_NETWORK_READY,
  RECOVERY_VAULT_CHANNEL,
  type RecoveryExportBrokerRequest,
  type RecoveryExportBrokerResult,
} from './network-protocol.js';

declare const __RECOVERY_VAULT_HTML__: string;
declare const __RECOVERY_NETWORK_WORKER_JS__: string;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Recovery shell is missing ${selector}.`);
  return element;
}

const vault = required<HTMLIFrameElement>('#recovery-secret-vault');
const errorBox = required<HTMLElement>('#recovery-shell-error');
const workerUrl = URL.createObjectURL(new Blob([__RECOVERY_NETWORK_WORKER_JS__], { type: 'text/javascript' }));
const networkWorker = new Worker(workerUrl, { name: 'wallet-discovery-public-network' });
const channel = new MessageChannel();
let channelDelivered = false;
let workerReady = false;
let workerUrlRevoked = false;
const workerReadyTimeout = setTimeout(() => {
  if (workerReady) return;
  revokeWorkerUrl();
  fatal('The isolated Recovery Network Worker did not complete its startup handshake.');
}, 15_000);

function revokeWorkerUrl(): void {
  if (workerUrlRevoked) return;
  workerUrlRevoked = true;
  URL.revokeObjectURL(workerUrl);
}

function fatal(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
  vault.contentWindow?.postMessage({ type: RECOVERY_NETWORK_FATAL, message }, '*');
}

networkWorker.addEventListener('error', (event) => {
  revokeWorkerUrl();
  fatal(`The isolated Recovery Network Worker failed: ${event.message || 'unknown worker error'}`);
});
networkWorker.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (typeof event.data !== 'object' || event.data === null) return;
  if ((event.data as { type?: unknown }).type !== RECOVERY_NETWORK_READY || workerReady) return;
  workerReady = true;
  clearTimeout(workerReadyTimeout);
  revokeWorkerUrl();
});
networkWorker.addEventListener('messageerror', () => {
  fatal('The isolated Recovery Network Worker emitted an unreadable message.');
});
networkWorker.postMessage({ type: RECOVERY_NETWORK_ATTACH }, [channel.port1]);

vault.addEventListener('load', () => {
  if (channelDelivered) return;
  channelDelivered = true;
  const target = vault.contentWindow;
  if (target === null) {
    fatal('The browser did not create the isolated Recovery Secret Vault.');
    return;
  }
  target.postMessage({ type: RECOVERY_VAULT_CHANNEL }, '*', [channel.port2]);
});
vault.srcdoc = __RECOVERY_VAULT_HTML__;

const MAX_EXPORT_BYTES = 268_435_456;

function exportResult(target: Window, result: RecoveryExportBrokerResult): void {
  target.postMessage(result, '*');
}

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== vault.contentWindow || typeof event.data !== 'object' || event.data === null) return;
  const request = event.data as Partial<RecoveryExportBrokerRequest>;
  if (request.type !== RECOVERY_EXPORT_REQUEST || typeof request.id !== 'string') return;
  const target = event.source as Window;
  if ((request.format !== 'csv' && request.format !== 'json') || typeof request.text !== 'string') {
    exportResult(target, { type: RECOVERY_EXPORT_RESULT, id: request.id, ok: false, error: 'Malformed export request.' });
    return;
  }
  const suffix = new Date().toISOString().replace(/[:.]/gu, '-');
  const filename = `wallet-discovery-report-${suffix}.${request.format}`;
  const mimeType = request.format === 'json' ? 'application/json' : 'text/csv';
  const blob = new Blob([request.text], { type: `${mimeType};charset=utf-8` });
  if (blob.size > MAX_EXPORT_BYTES) {
    exportResult(target, { type: RECOVERY_EXPORT_RESULT, id: request.id, ok: false, error: 'The export exceeds the 256 MiB safety ceiling.' });
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    exportResult(target, { type: RECOVERY_EXPORT_RESULT, id: request.id, ok: true, filename });
  } catch (cause) {
    exportResult(target, {
      type: RECOVERY_EXPORT_RESULT,
      id: request.id,
      ok: false,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
});

window.addEventListener('beforeunload', () => {
  clearTimeout(workerReadyTimeout);
  revokeWorkerUrl();
  networkWorker.terminate();
});
