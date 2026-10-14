import { deriveBitcoin } from "./bitcoin/index.js";
import { BitcoinPurposeProfile } from "./bitcoin/profiles.js";
import { DashRuntimeRegistry } from "./dash/runtime.js";
import { deriveEthereum } from "./ethereum/index.js";
import * as registry from "./registry.js";
import type { RuntimeCoinAdapter } from "./runtime-types.js";
export type { RuntimeCoinAdapter } from "./runtime-types.js";

function deriveForAdapter(adapterId: string): RuntimeCoinAdapter["derive"] {
  const bitcoinProfile = BitcoinPurposeProfile.forAdapterId(adapterId);
  if (bitcoinProfile !== undefined) return (input) => deriveBitcoin(bitcoinProfile.mode, input);
  if (adapterId === "ethereum") return deriveEthereum;
  throw new Error(`Unsupported derivation protocol: ${adapterId}.`);
}

/** Runtime registry. Import this only inside isolated derivation workers or tests. */
export function getRuntimeCoinAdapter(id: string): RuntimeCoinAdapter {
  const dash = DashRuntimeRegistry.adapter(id, registry);
  if (dash !== undefined) return dash;
  const metadata = registry.getCoinAdapter(id);
  return { ...metadata, derive: deriveForAdapter(id) };
}
