import { initSync, MhfeEngine, suiteParametersJson } from '@ckd/recovery-mhfe-wasm/mhfe.js';
import mhfeWasmBytes from '@ckd/recovery-mhfe-wasm/mhfe_bg.wasm';

interface Request {
  readonly id: number;
  readonly type:
    | 'encrypt'
    | 'encryptPreservingFinalWord'
    | 'decryptAuto'
    | 'decryptExplicit'
    | 'decryptPreservingFinalWord';
  readonly pim: number;
  readonly passwordAscii: string;
  readonly mnemonic?: string;
  readonly container?: string;
  readonly sourceWords?: number;
}

const scope = self as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<Request>) => void): void;
};

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function ambiguousSourceWords(cause: unknown): number[] | undefined {
  const message = errorMessage(cause);
  const marker = 'ambiguous source length: recovery verifier matches ';
  const offset = message.indexOf(marker);
  if (offset < 0) return undefined;
  const matches = message
    .slice(offset + marker.length)
    .match(/\b(?:12|15|18|21)\b/gu)
    ?.map(Number);
  return matches === undefined || matches.length < 2 ? undefined : [...new Set(matches)];
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
  if (
    request.type === 'decryptExplicit' &&
    (!Number.isSafeInteger(request.sourceWords) || ![12, 15, 18, 21, 24].includes(request.sourceWords ?? 0))
  )
    return;
  let engine: MhfeEngine | undefined;
  try {
    engine = new MhfeEngine(request.pim);
    engine.setAsciiPassword(request.passwordAscii);
    const reportProgress = (progressJson: string): boolean => {
      scope.postMessage({ id: request.id, type: 'progress', progress: JSON.parse(progressJson) });
      return true;
    };
    let result: unknown;
    if (request.type === 'encrypt') {
      result = JSON.parse(engine.encryptJson(request.mnemonic ?? '')) as unknown;
    } else if (request.type === 'encryptPreservingFinalWord') {
      result = JSON.parse(engine.encryptPreservingFinalWordJson(request.mnemonic ?? '', reportProgress)) as unknown;
    } else if (request.type === 'decryptPreservingFinalWord') {
      result = JSON.parse(engine.decryptPreservingFinalWordJson(request.container ?? '', reportProgress)) as unknown;
    } else if (request.type === 'decryptExplicit') {
      result = JSON.parse(engine.decryptJson(request.container ?? '', request.sourceWords ?? 0)) as unknown;
    } else {
      try {
        result = JSON.parse(engine.decryptAutoJson(request.container ?? '')) as unknown;
      } catch (cause) {
        const matchingWords = ambiguousSourceWords(cause);
        if (matchingWords === undefined) throw cause;
        result = {
          ambiguousCandidates: matchingWords.map((sourceWords) =>
            JSON.parse(engine.decryptJson(request.container ?? '', sourceWords)),
          ),
        };
      }
    }
    scope.postMessage({ id: request.id, ok: true, result });
  } catch (cause) {
    scope.postMessage({ id: request.id, ok: false, error: errorMessage(cause) });
  } finally {
    engine?.clearPassword();
    engine?.free();
  }
});
