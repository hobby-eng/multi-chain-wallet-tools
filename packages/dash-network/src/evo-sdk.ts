// The trusted Evo SDK client of a network, made one way for every page that asks DAPI.
import { EvoSDK } from "@dashevo/evo-sdk";
import type { ViewerNetwork } from "./types.js";

/** The connection settings of a client that lets the SDK retry: three tries, bounded waits. */
export const EVO_RETRYING_SETTINGS = Object.freeze({
  connectTimeoutMs: 10_000,
  timeoutMs: 30_000,
  retries: 3,
  banFailedAddress: true,
});

/** A trusted client of `network`, connected by its caller, with `settings`. */
export function trustedEvoSdk(
  network: ViewerNetwork,
  settings: {
    readonly connectTimeoutMs: number;
    readonly timeoutMs: number;
    readonly retries: number;
    readonly banFailedAddress: boolean;
  } = EVO_RETRYING_SETTINGS,
): EvoSDK {
  const options = { settings: { ...settings } };
  return network === "mainnet" ? EvoSDK.mainnetTrusted(options) : EvoSDK.testnetTrusted(options);
}
