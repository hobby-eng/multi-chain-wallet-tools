import { afterEach, expect, it, vi } from "vitest";
import { fetchJson } from "../../../packages/public-data-providers/src/http.js";
import { readProviderJson } from "../../../packages/dash-network/src/provider-json.js";

const CHUNK_BYTES = 1024 * 1024;
const TOTAL_CHUNKS = 22;
const PUBLIC_LIMIT_BYTES = 20_000_000;

function oversizedResponse() {
  // Bounded synthetic input: one reusable 1 MiB chunk, at most 22 MiB transferred.
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

it("stops public-provider body consumption at the safety ceiling", async () => {
  const { response, state } = oversizedResponse();
  vi.stubGlobal("fetch", async () => response);
  await expect(fetchJson("https://public-provider.invalid/synthetic")).rejects.toThrow(
    "size limit",
  );
  console.log("Public provider synthetic stream:", JSON.stringify(state));
  expect(state.emitted).toBeLessThan(TOTAL_CHUNKS);
  expect(state.cancelled).toBe(true);
});

it("the existing Dash reader cancels the same oversized stream", async () => {
  const { response, state } = oversizedResponse();
  await expect(readProviderJson(response, undefined, PUBLIC_LIMIT_BYTES)).rejects.toThrow(
    "safety limit",
  );
  console.log("Dash bounded-reader control:", JSON.stringify(state));
  expect(state.emitted).toBeLessThan(TOTAL_CHUNKS);
  expect(state.cancelled).toBe(true);
});
