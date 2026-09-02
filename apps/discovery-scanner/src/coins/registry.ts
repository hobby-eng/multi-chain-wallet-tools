import type { RecoveryCoinAdapter } from '../types.js';

const adapters = new Map<string, RecoveryCoinAdapter>();

export function registerRecoveryCoin(adapter: RecoveryCoinAdapter): void {
  if (adapters.has(adapter.id)) throw new Error(`Recovery coin adapter ${adapter.id} is already registered.`);
  adapters.set(adapter.id, adapter);
}

export function getRecoveryCoin(id: string): RecoveryCoinAdapter {
  const adapter = adapters.get(id);
  if (adapter === undefined) throw new Error(`Unsupported recovery coin: ${id}.`);
  return adapter;
}

export function listRecoveryCoins(): RecoveryCoinAdapter[] {
  return [...adapters.values()];
}
