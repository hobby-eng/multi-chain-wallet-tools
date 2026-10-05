import { describe, expect, it, vi } from "vitest";
import { readBoundedJson } from "../src/bounded-json.js";

const encoder = new TextEncoder();

/** A response whose body is the given chunks; `state` records how far the reader got. */
function streamedResponse(chunks: Uint8Array[], headers: Record<string, string> = {}) {
  const state = { emitted: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[state.emitted];
      if (chunk === undefined) controller.close();
      else {
        state.emitted += 1;
        controller.enqueue(chunk);
      }
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { response: new Response(body, { headers }), state };
}

describe("bounded JSON reader", () => {
  it("accepts a body of exactly the limit", async () => {
    const bytes = encoder.encode('{"a":1}');
    const { response } = streamedResponse([bytes]);
    expect(await readBoundedJson(response, undefined, bytes.length)).toEqual({ a: 1 });
  });

  it("rejects one byte over the limit and cancels the stream before the rest", async () => {
    const bytes = encoder.encode('{"a":1}');
    const rest = encoder.encode("     ");
    const { response, state } = streamedResponse([bytes, encoder.encode(" "), rest]);
    await expect(readBoundedJson(response, undefined, bytes.length)).rejects.toThrow(
      `exceeds the size limit (safety limit: ${bytes.length} bytes)`,
    );
    expect(state.emitted).toBe(2);
    expect(state.cancelled).toBe(true);
  });

  it("does not trust a Content-Length that understates the body", async () => {
    const { response, state } = streamedResponse(
      [encoder.encode('{"a":"'), new Uint8Array(64).fill(0x61), encoder.encode('"}')],
      { "content-length": "4" },
    );
    await expect(readBoundedJson(response, undefined, 32)).rejects.toThrow("size limit");
    expect(state.cancelled).toBe(true);
  });

  it("rejects a declared oversized body without reading it", async () => {
    const { response, state } = streamedResponse([encoder.encode("{}")], {
      "content-length": "100",
    });
    await expect(readBoundedJson(response, undefined, 10)).rejects.toThrow("size limit");
    expect(state.emitted).toBe(0);
  });

  it("reads a body without Content-Length", async () => {
    const { response } = streamedResponse([encoder.encode("[1,"), encoder.encode("2]")]);
    expect(await readBoundedJson(response, undefined, 100)).toEqual([1, 2]);
  });

  it("counts bytes, not characters, for multi-byte UTF-8 split across chunks", async () => {
    const bytes = encoder.encode('"€€"');
    const { response } = streamedResponse([bytes.slice(0, 2), bytes.slice(2, 5), bytes.slice(5)]);
    expect(await readBoundedJson(response, undefined, bytes.length)).toBe("€€");
    const { response: tooLong } = streamedResponse([bytes]);
    // Four characters but eight bytes: a character count would wrongly accept this.
    await expect(readBoundedJson(tooLong, undefined, 4)).rejects.toThrow("size limit");
  });

  it("cancels the body when the caller aborts while it is being read", async () => {
    const caller = new AbortController();
    const cancelled = vi.fn();
    const response = new Response(new ReadableStream({ cancel: cancelled }));
    const result = readBoundedJson(response, caller.signal, 100);
    caller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("fails closed on malformed or missing JSON", async () => {
    const { response } = streamedResponse([encoder.encode('{"a":')]);
    await expect(readBoundedJson(response, undefined, 100)).rejects.toThrow("malformed JSON");
    await expect(readBoundedJson(new Response(null), undefined, 100)).rejects.toThrow(
      "empty JSON response",
    );
  });

  it("rejects an invalid limit", async () => {
    await expect(readBoundedJson(new Response("{}"), undefined, 0)).rejects.toThrow(
      "Invalid provider response size limit",
    );
  });
});
