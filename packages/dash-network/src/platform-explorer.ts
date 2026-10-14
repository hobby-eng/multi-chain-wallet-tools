// Dash Platform Explorer, the index that the Platform history clients and the recovery vault ask:
// its origins, its name, the checks of its answers, and the check of its status that every lookup
// starts with.
import { assertPlatformExplorerNetwork } from "./provider-json.js";
import { createProviderHttp, type FetchLike } from "./provider-http.js";
import type { ViewerNetwork } from "./types.js";

/** The Explorer's origin of each network. */
export const PLATFORM_EXPLORER_ENDPOINTS: Readonly<Record<ViewerNetwork, string>> = {
  mainnet: "https://platform-explorer.pshenmic.dev",
  testnet: "https://testnet.platform-explorer.pshenmic.dev",
};

/** The name a result gives as its source. */
export const PLATFORM_EXPLORER_NAME = "Dash Platform Explorer";

/** The checks of the Explorer's answers, each error naming the Explorer. */
export const PLATFORM_EXPLORER_HTTP = createProviderHttp("Platform Explorer");

/**
 * The Explorer's latest indexed block, read from its status. Refuses an index that is not in step
 * with Dash Platform, or that serves another network.
 */
export async function platformExplorerTip(
  fetcher: FetchLike,
  network: ViewerNetwork,
  signal: AbortSignal | undefined,
): Promise<{ indexedHeight: number; indexedTimeMs: number }> {
  const { object, requiredInteger, fetchJson } = PLATFORM_EXPLORER_HTTP;
  const endpoint = PLATFORM_EXPLORER_ENDPOINTS[network];
  const status = object(await fetchJson(fetcher, `${endpoint}/status`, signal), "index status");
  const indexer = object(status.indexer, "indexer status");
  if (indexer.status !== "synced") {
    throw new Error(
      "Platform Explorer reports that its index is not synchronized with Dash Platform.",
    );
  }
  assertPlatformExplorerNetwork(status.network, network);
  const api = object(status.api, "API status");
  const tip = object(api.block, "latest indexed block");
  const indexedHeight = requiredInteger(tip.height, "latest indexed Platform height");
  const indexedTimeMs = typeof tip.timestamp === "string" ? Date.parse(tip.timestamp) : Number.NaN;
  if (!Number.isFinite(indexedTimeMs))
    throw new Error("Platform Explorer returned an invalid latest indexed block time.");
  return { indexedHeight, indexedTimeMs };
}
