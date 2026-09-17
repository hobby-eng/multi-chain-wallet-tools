import { PROVIDER_UNSIGNED_DECIMAL } from '@ckd/core/numeric-limits.js';
import { boundedFetch } from '@ckd/network-boundary/bounded-fetch.js';

const DECIMAL_PATTERN = PROVIDER_UNSIGNED_DECIMAL;

export function publicProviderAbortError(): DOMException {
  return new DOMException('Recovery network operation cancelled.', 'AbortError');
}

function readProviderJson(response: Response, signal: AbortSignal): Promise<unknown> {
  return response.text().then(
    (text) => {
      if (text.length > 20_000_000) throw new Error('Network provider response exceeded the size limit.');
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new Error('Network provider returned malformed JSON.');
      }
    },
    (cause) => {
      if (signal.aborted) throw publicProviderAbortError();
      throw cause;
    },
  );
}

export function record(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Public provider returned malformed ${context}.`);
  }
  return value as Record<string, unknown>;
}

export function decimal(value: unknown, context: string, nullAsZero = false): string {
  if (nullAsZero && (value === null || value === undefined)) return '0';
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !DECIMAL_PATTERN.test(text)) {
    throw new Error(`Public provider returned an invalid ${context}.`);
  }
  return text;
}

export function unsignedInteger(value: unknown, context: string): number {
  const numeric = typeof value === 'string' && DECIMAL_PATTERN.test(value) ? Number(value) : value;
  if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error(`Public provider returned an invalid ${context}.`);
  }
  return numeric;
}

export function fetchJson(
  url: string,
  signal?: AbortSignal,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<unknown> {
  return boundedFetch(url, {
    signal,
    init,
    timeoutMs,
    abortError: publicProviderAbortError,
    read: readProviderJson,
  });
}
