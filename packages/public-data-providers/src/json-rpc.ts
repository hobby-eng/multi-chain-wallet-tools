// JSON-RPC 2.0 batches, as the EVM networks' endpoints and Solana's answer them: every call comes
// back once, by its id, with a result; anything else is a provider failure, never an empty answer.
import { fetchJson } from "./http.js";

/** One call of a batch. */
export interface JsonRpcCall {
  readonly jsonrpc: "2.0";
  readonly id: string;
  readonly method: string;
  readonly params: readonly unknown[];
}

/** The call `method` with `params`, answered under `id`. */
export const jsonRpcCall = (
  id: string,
  method: string,
  params: readonly unknown[] = [],
): JsonRpcCall => ({ jsonrpc: "2.0", id, method, params });

/**
 * Posts `calls` as one batch to `endpoint` and returns each call's result by its id. A short batch,
 * an error object, a missing result, a repeated or foreign id fails with `fail(what)`; the caller
 * checks each result's shape.
 */
export async function jsonRpcBatch(
  endpoint: string,
  calls: readonly JsonRpcCall[],
  fail: (what: string) => Error,
  signal?: AbortSignal,
): Promise<ReadonlyMap<string, unknown>> {
  const raw = await fetchJson(endpoint, signal, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(calls),
  });
  if (!Array.isArray(raw) || raw.length !== calls.length) throw fail("an incomplete batch");
  const expected = new Set(calls.map(({ id }) => id));
  const results = new Map<string, unknown>();
  for (const item of raw) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      "error" in item ||
      !("result" in item) ||
      !("id" in item) ||
      typeof item.id !== "string"
    )
      throw fail("a malformed or failed response");
    if (!expected.has(item.id) || results.has(item.id))
      throw fail("a repeated or unrequested response ID");
    results.set(item.id, item.result);
  }
  return results;
}
