import { DashRuntimeRegistry } from "./dash/runtime.js";
import * as registry from "./dash-registry.js";
import type { RuntimeCoinAdapter } from "./runtime-types.js";
export type { RuntimeCoinAdapter } from "./runtime-types.js";

export function getRuntimeCoinAdapter(id: string): RuntimeCoinAdapter {
  const adapter = DashRuntimeRegistry.adapter(id, registry);
  if (adapter !== undefined) return adapter;
  // Preserve edition admission (and its error) even when this shared dispatch has no route.
  registry.getCoinAdapter(id);
  throw new Error(`Unsupported Dash derivation protocol: ${id}.`);
}
