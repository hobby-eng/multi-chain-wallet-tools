import { providerValues } from "@ckd/core/provider-values.js";
import { networkCancelledError } from "@ckd/core/error-handling.js";
import { boundedFetch } from "@ckd/network-boundary/bounded-fetch.js";
import { readBoundedJson } from "@ckd/network-boundary/bounded-json.js";

/** Byte ceiling for one Bitcoin or Ethereum provider response; the earlier check used it too. */
const MAX_PUBLIC_PROVIDER_JSON_BYTES = 20_000_000;

// boundedFetch turns an abort during body reading into the caller's abort or timeout error.
function readProviderJson(response: Response, signal: AbortSignal): Promise<unknown> {
  return readBoundedJson(response, signal, MAX_PUBLIC_PROVIDER_JSON_BYTES);
}

export const { record, decimal, unsignedInteger } = providerValues("Public provider");

/** The time one provider request may take, headers and body together. */
const PROVIDER_TIMEOUT_MS = 30_000;

export function fetchJson(
  url: string,
  signal?: AbortSignal,
  init: RequestInit = {},
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<unknown> {
  return boundedFetch(url, {
    signal,
    init,
    timeoutMs,
    abortError: networkCancelledError,
    read: readProviderJson,
  });
}

/**
 * The JSON answer of a GET of `url` with its HTTP status, where an error status of
 * `answerStatuses` (such as a provider's 404 for an unknown account) is an answer too; any other
 * error status fails as fetchJson fails.
 */
export function fetchJsonAnswer(
  url: string,
  answerStatuses: readonly number[],
  signal?: AbortSignal,
): Promise<{ readonly status: number; readonly body: unknown }> {
  return boundedFetch(url, {
    signal,
    init: {},
    timeoutMs: PROVIDER_TIMEOUT_MS,
    abortError: networkCancelledError,
    answerStatuses,
    read: async (response, requestSignal) => ({
      status: response.status,
      body: await readProviderJson(response, requestSignal),
    }),
  });
}
