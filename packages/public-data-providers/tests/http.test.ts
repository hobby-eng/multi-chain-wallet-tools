import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../src/http.js";
import { PublicMultiChainDataService } from "../src/multi-chain-service.js";

const CHUNK_BYTES = 1024 * 1024;
// 22 MiB is just above the 20,000,000-byte public provider ceiling.
const TOTAL_CHUNKS = 22;

/** A finite 22 MiB response body that records how many chunks were read and whether it was cancelled. */
function oversizedResponse() {
  const chunk = new Uint8Array(CHUNK_BYTES).fill(32);
  const state = { emitted: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.emitted === TOTAL_CHUNKS) controller.close();
      else {
        state.emitted += 1;
        controller.enqueue(chunk);
      }
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { response: new Response(body), state };
}

afterEach(() => vi.unstubAllGlobals());

describe("public provider HTTP reading", () => {
  // AUD-021-SEC001: the body ceiling must stop ingestion, not run after buffering everything.
  it("stops reading an oversized provider body at the ceiling", async () => {
    const { response, state } = oversizedResponse();
    vi.stubGlobal("fetch", async () => response);
    await expect(fetchJson("https://public-provider.invalid/synthetic")).rejects.toThrow(
      "size limit",
    );
    expect(state.emitted).toBeLessThan(TOTAL_CHUNKS);
    expect(state.cancelled).toBe(true);
  });

  it("turns a caller abort during the body into the provider abort error", async () => {
    const caller = new AbortController();
    const cancelled = vi.fn();
    vi.stubGlobal("fetch", async () => new Response(new ReadableStream({ cancel: cancelled })));
    const result = fetchJson("https://public-provider.invalid/stalled", caller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    caller.abort();
    await expect(result).rejects.toMatchObject({
      name: "AbortError",
      message: "Recovery network operation cancelled.",
    });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it("reports a Bitcoin lookup as failed, not as a zero balance, when every body is oversized", async () => {
    vi.stubGlobal("fetch", async () => oversizedResponse().response);
    const service = new PublicMultiChainDataService();
    await expect(
      service.utxoAddresses("mainnet", ["1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA"]),
    ).rejects.toThrow("size limit");
  }, 15_000);
});
