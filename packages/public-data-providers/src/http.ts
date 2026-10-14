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
    abortError: networkCancelledError,
    read: readProviderJson,
  });
}
