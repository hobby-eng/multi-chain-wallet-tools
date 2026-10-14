import type { RecoveryCoinAdapter } from "../types.js";

export interface RecoveryCoinRegistry {
  getRecoveryCoin(id: string): RecoveryCoinAdapter;
  listRecoveryCoins(): RecoveryCoinAdapter[];
}

export function createRecoveryCoinRegistry(
  registeredAdapters: readonly RecoveryCoinAdapter[],
): RecoveryCoinRegistry {
  const adapters = new Map<string, RecoveryCoinAdapter>();
  for (const adapter of registeredAdapters) {
    if (adapters.has(adapter.id)) {
      throw new Error(`Recovery coin adapter ${adapter.id} is already registered.`);
    }
    adapters.set(adapter.id, adapter);
  }
  return {
    getRecoveryCoin(id: string): RecoveryCoinAdapter {
      const adapter = adapters.get(id);
      if (adapter === undefined) throw new Error(`Unsupported recovery coin: ${id}.`);
      return adapter;
    },
    listRecoveryCoins(): RecoveryCoinAdapter[] {
      return [...adapters.values()];
    },
  };
}

/** What a coin is, whichever scans a build includes: its name, networks, unit, history and paths. */
export type RecoveryCoinFacts = Pick<
  RecoveryCoinAdapter,
  "id" | "label" | "networks" | "amountUnit" | "getHistory" | "customPath"
>;

/** The watch-only half of an adapter. */
export type WatchOnlyScans = Required<
  Pick<RecoveryCoinAdapter, "detectWatchOnly" | "scanWatchOnly">
>;

/** The adapter of a build that scans watch-only keys but no seeds. */
export function watchOnlyAdapter(
  coin: RecoveryCoinFacts,
  watchOnly: WatchOnlyScans,
): RecoveryCoinAdapter {
  return {
    ...coin,
    scan: async () => Promise.reject(new Error("Seed discovery is not included in this build.")),
    ...watchOnly,
  };
}
