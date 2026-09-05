import type { RecoveryCoinAdapter } from '../types.js';

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
