/** Applies to first-party HTTP JSON adapters, not the SDK's proof transport. */
export const MAX_PROVIDER_JSON_BYTES = 8 * 1024 * 1024;

export async function readProviderJson(response: Response, signal?: AbortSignal, maximumBytes = MAX_PROVIDER_JSON_BYTES): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('Invalid provider response size limit.');
  signal?.throwIfAborted();
  const tooLarge = () => new Error(`Provider response exceeds the ${maximumBytes}-byte safety limit.`);
  const declared = response.headers.get('content-length');
  if (declared !== null && (/^[0-9]+$/u.test(declared) && (declared.length > 10 || Number(declared) > maximumBytes))) {
    void response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (response.body === null) throw new Error('Provider returned an empty JSON response.');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let size = 0, text = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) { cancel(); throw tooLarge(); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Validate complete explorer pages before applying any display truncation. */
export function validateAddressHistoryPage(values: unknown, total: unknown, expected: number, limit: number, seen: Set<string>): asserts values is Record<string, unknown>[] {
  if (!Array.isArray(values) || values.length > limit) throw new Error('Address history returned an invalid or oversized page.');
  if (!Number.isSafeInteger(total) || total !== expected) throw new Error('Address history changed during pagination or omitted its total.');
  if (seen.size + values.length > expected) throw new Error('Address history exceeded its reported transaction count.');
  for (const item of values) {
    const hash = item !== null && typeof item === 'object' ? item.hash : undefined;
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/iu.test(hash) || seen.has(hash.toLowerCase())) throw new Error('Address history contains an invalid or repeated transaction ID.');
    seen.add(hash.toLowerCase());
  }
}
export function assertPlatformExplorerNetwork(value: unknown, network: 'mainnet' | 'testnet'): void {
  const reported = typeof value === 'string' ? value.toLowerCase() : '';
  const valid = network === 'mainnet' ? ['evo1', 'mainnet'].includes(reported) : /^(?:testnet|dash-testnet-[0-9]+)$/u.test(reported);
  if (!valid) throw new Error('Platform Explorer returned an unknown or wrong network.');
}
