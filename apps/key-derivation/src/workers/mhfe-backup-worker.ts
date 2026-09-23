import { initSync, MhfeEngine, suiteParametersJson } from '@ckd/recovery-mhfe-wasm/mhfe.js';
import mhfeWasmBytes from '@ckd/recovery-mhfe-wasm/mhfe_bg.wasm';

interface Request {
  readonly id: number;
  readonly type: 'encrypt' | 'encryptPreservingFinalWord' | 'decryptAuto' | 'decrypt24' | 'decryptPreservingFinalWord';
  readonly pim: number;
  readonly passwordAscii: string;
  readonly mnemonic?: string;
  readonly container?: string;
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<Request>) => void): void;
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

try {
  initSync({ module: mhfeWasmBytes });
  scope.postMessage({ type: 'ready', parameters: JSON.parse(suiteParametersJson()) });
} catch (cause) {
  scope.postMessage({ type: 'initializationError', error: errorMessage(cause) });
}

scope.addEventListener('message', (event: MessageEvent<Request>) => {
  const request = event.data;
  if (!Number.isSafeInteger(request.id) || !Number.isSafeInteger(request.pim) || request.pim < 0 || request.pim > 31)
    return;
  let engine: MhfeEngine | undefined;
  try {
    engine = new MhfeEngine(request.pim);
    engine.setAsciiPassword(request.passwordAscii);
    const reportProgress = (progressJson: string): boolean => {
      scope.postMessage({ id: request.id, type: 'progress', progress: JSON.parse(progressJson) });
      return true;
    };
    const result = JSON.parse(
      request.type === 'encrypt'
        ? engine.encryptJson(request.mnemonic ?? '')
        : request.type === 'encryptPreservingFinalWord'
          ? engine.encryptPreservingFinalWordJson(request.mnemonic ?? '', reportProgress)
          : request.type === 'decryptPreservingFinalWord'
            ? engine.decryptPreservingFinalWordJson(request.container ?? '', reportProgress)
            : request.type === 'decrypt24'
              ? engine.decryptJson(request.container ?? '', 24)
              : engine.decryptAutoJson(request.container ?? ''),
    ) as unknown;
    scope.postMessage({ id: request.id, ok: true, result });
  } catch (cause) {
    scope.postMessage({ id: request.id, ok: false, error: errorMessage(cause) });
  } finally {
    engine?.clearPassword();
    engine?.free();
  }
});
