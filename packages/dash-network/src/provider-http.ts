import { readProviderJson } from './provider-json.js';
import { MAX_PROVIDER_INTEGER, PROVIDER_SIGNED_DECIMAL } from '@ckd/core/numeric-limits.js';
import { requireRecord } from '@ckd/core/records.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ProviderHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function createProviderHttp(provider: string) {
  function object(value: unknown, context: string): Record<string, unknown> {
    return requireRecord(value, `${provider} returned malformed ${context}.`);
  }

  function optionalInteger(value: unknown): number | null {
    const number = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value;
    return typeof number === 'number' && Number.isSafeInteger(number) && number >= 0 ? number : null;
  }

  function requiredInteger(value: unknown, context: string): number {
    const number = optionalInteger(value);
    if (number === null) throw new Error(`${provider} returned an invalid ${context}.`);
    return number;
  }

  function exactInteger(value: unknown, context: string, nullAsZero = false): bigint {
    if (nullAsZero && (value === null || value === undefined)) return 0n;
    if (typeof value === 'bigint' && value >= -MAX_PROVIDER_INTEGER && value <= MAX_PROVIDER_INTEGER) return value;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === 'string' && PROVIDER_SIGNED_DECIMAL.test(value)) return BigInt(value);
    throw new Error(`${provider} returned an invalid ${context}.`);
  }

  async function fetchJson(fetcher: FetchLike, url: string, signal?: AbortSignal): Promise<unknown> {
    const response = await fetcher(url, { cache: 'no-store', ...(signal === undefined ? {} : { signal }) });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new ProviderHttpError(response.status, `${provider} request failed with HTTP ${response.status}.`);
    }
    return readProviderJson(response, signal);
  }

  return { object, optionalInteger, requiredInteger, exactInteger, fetchJson };
}
