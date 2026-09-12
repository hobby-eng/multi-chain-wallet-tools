import { assertPlatformExplorerNetwork } from '../src/provider-json.js';
import { expect, it, vi } from 'vitest';
import { readProviderJson } from '../src/provider-json.js';
import { createProviderHttp } from '../src/provider-http.js';

it('rejects oversized declared and chunked responses without parsing them', async () => {
  await expect(readProviderJson(new Response('{}', { headers: { 'content-length': '100' } }), undefined, 10)).rejects.toThrow('safety limit');
  const cancelled = vi.fn();
  const response = new Response(new ReadableStream({
    start(c) { c.enqueue(new TextEncoder().encode('{"large":"')); c.enqueue(new Uint8Array(100)); }, cancel: cancelled,
  }));
  await expect(readProviderJson(response, undefined, 20)).rejects.toThrow('safety limit');
  expect(cancelled).toHaveBeenCalledOnce();
});
it('handles UTF-8 split across chunks at the exact byte limit', async () => {
  const bytes = new TextEncoder().encode('"€"');
  const response = new Response(new ReadableStream({ start(c) { c.enqueue(bytes.slice(0,2)); c.enqueue(bytes.slice(2)); c.close(); } }));
  expect(await readProviderJson(response, undefined, bytes.length)).toBe('€');
});
it('cancels a stalled body even if a custom fetcher does not relay abort', async () => {
  const caller = new AbortController(); const cancelled = vi.fn();
  const response = new Response(new ReadableStream({ cancel: cancelled }));
  const result = readProviderJson(response, caller.signal);
  caller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancelled).toHaveBeenCalledOnce();
});
it('rejects huge signed provider amounts while preserving supported negative amounts', () => {
  const provider = createProviderHttp('Test');
  expect(provider.exactInteger('-123', 'amount')).toBe(-123n);
  expect(() => provider.exactInteger('9'.repeat(101), 'amount')).toThrow('invalid');
});


it.each([undefined, '', 'unrelated-chain', 'devnet', 'testnet'])('rejects unknown/wrong mainnet status %s', value => {
  expect(() => assertPlatformExplorerNetwork(value, 'mainnet')).toThrow(/network/iu);
});
