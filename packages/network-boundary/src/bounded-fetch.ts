interface BoundedFetchOptions<T> {
  readonly signal: AbortSignal | undefined;
  readonly init: RequestInit | undefined;
  readonly timeoutMs: number;
  readonly abortError: () => DOMException;
  readonly read: (response: Response, signal: AbortSignal) => Promise<T>;
}

/** Performs one no-store request whose deadline covers both headers and body consumption. */
export async function boundedFetch<T>(url: string, options: BoundedFetchOptions<T>): Promise<T> {
  if (options.signal?.aborted) throw options.abortError();
  const requestController = new AbortController();
  let timedOut = false;
  const abortFromCaller = (): void => requestController.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    requestController.abort();
  }, options.timeoutMs);
  try {
    const response = await globalThis.fetch(url, {
      ...(options.init ?? {}),
      cache: 'no-store',
      signal: requestController.signal,
    });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error(`Network request failed with HTTP ${response.status}.`);
    }
    return await options.read(response, requestController.signal);
  } catch (cause) {
    if (options.signal?.aborted) throw options.abortError();
    if (timedOut) throw new Error(`Network request timed out after ${Math.ceil(options.timeoutMs / 1_000)} seconds.`);
    throw cause;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
