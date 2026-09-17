import { readProviderJson } from '@ckd/dash-network/provider-json.js';
import { boundedFetch } from '@ckd/network-boundary/bounded-fetch.js';

const PRIMARY_HTTP_TIMEOUT_MS = 30_000;

export function recoveryAbortError(): DOMException {
  return new DOMException('Recovery network operation cancelled.', 'AbortError');
}

export function throwIfRecoveryAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw recoveryAbortError();
}

export function fetchRecoveryJson(
  url: string,
  signal?: AbortSignal,
  init: RequestInit = {},
  timeoutMs = PRIMARY_HTTP_TIMEOUT_MS,
): Promise<unknown> {
  return boundedFetch(url, {
    signal,
    init,
    timeoutMs,
    abortError: recoveryAbortError,
    read: readProviderJson,
  });
}
