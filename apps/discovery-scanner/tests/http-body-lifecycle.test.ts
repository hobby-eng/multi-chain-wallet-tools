import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from '../src/network-service.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function stalledBody(): { headers: Promise<void>; signal: () => AbortSignal | undefined } {
  let received: () => void = () => {};
  const headers = new Promise<void>(resolve => { received = resolve; });
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    signal = init.signal as AbortSignal;
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"incomplete":'));
        signal!.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
      },
    }));
    received();
    return response;
  }));
  return { headers, signal: () => signal };
}

describe('HTTP JSON body lifecycle', () => {
  it('relays caller cancellation after headers while the response body stalls', async () => {
    const body = stalledBody();
    const caller = new AbortController();
    const result = fetchJson('https://example.test', caller.signal);
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await body.headers;
    await Promise.resolve();
    caller.abort();
    await rejected;
    expect(body.signal()?.aborted).toBe(true);
  });

  it('keeps the timeout active while reading a partial JSON body', async () => {
    vi.useFakeTimers();
    const body = stalledBody();
    const result = fetchJson('https://example.test', undefined, {}, 1000);
    const rejected = expect(result).rejects.toThrow('timed out after 1 seconds');
    await body.headers;
    await vi.advanceTimersByTimeAsync(1000);
    await rejected;
    expect(body.signal()?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases the caller relay and timer after successful body consumption', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      return new Response('{"ok":true}');
    }));
    const caller = new AbortController();
    await expect(fetchJson('https://example.test', caller.signal)).resolves.toEqual({ ok: true });
    caller.abort();
    expect(requestSignal?.aborted).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
