import { readBoundedJson } from "@ckd/network-boundary/bounded-json.js";

/** Applies to first-party HTTP JSON adapters, not the SDK's proof transport. */
const MAX_PROVIDER_JSON_BYTES = 8 * 1024 * 1024;

export function readProviderJson(
  response: Response,
  signal?: AbortSignal,
  maximumBytes = MAX_PROVIDER_JSON_BYTES,
): Promise<unknown> {
  return readBoundedJson(response, signal, maximumBytes);
}

/** Validate complete explorer pages before applying any display truncation. */
export function validateAddressHistoryPage(
  values: unknown,
  total: unknown,
  expected: number,
  limit: number,
  seen: Set<string>,
): asserts values is Record<string, unknown>[] {
  if (!Array.isArray(values) || values.length > limit)
    throw new Error("Address history returned an invalid or oversized page.");
  if (!Number.isSafeInteger(total) || total !== expected)
    throw new Error("Address history changed during pagination or omitted its total.");
  if (seen.size + values.length > expected)
    throw new Error("Address history exceeded its reported transaction count.");
  for (const item of values) {
    const hash = item !== null && typeof item === "object" ? item.hash : undefined;
    if (typeof hash !== "string" || !/^[0-9a-f]{64}$/iu.test(hash) || seen.has(hash.toLowerCase()))
      throw new Error("Address history contains an invalid or repeated transaction ID.");
    seen.add(hash.toLowerCase());
  }
}
export function assertPlatformExplorerNetwork(
  value: unknown,
  network: "mainnet" | "testnet",
): void {
  const reported = typeof value === "string" ? value.toLowerCase() : "";
  const valid =
    network === "mainnet"
      ? ["evo1", "mainnet"].includes(reported)
      : /^(?:testnet|dash-testnet-[0-9]+)$/u.test(reported);
  if (!valid) throw new Error("Platform Explorer returned an unknown or wrong network.");
}
