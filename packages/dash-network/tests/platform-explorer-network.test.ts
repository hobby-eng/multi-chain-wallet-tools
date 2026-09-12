import { describe, expect, it } from 'vitest';
import { assertPlatformExplorerNetwork } from '../src/provider-json.js';
describe('Platform Explorer network identity', () => {
  it('accepts known mainnet/testnet IDs and rejects opposite or unidentified networks', () => {
    for (const id of ['evo1', 'mainnet']) {
      expect(() => assertPlatformExplorerNetwork(id, 'mainnet')).not.toThrow();
      expect(() => assertPlatformExplorerNetwork(id, 'testnet')).toThrow();
    }
    for (const id of ['dash-testnet-51', 'testnet']) {
      expect(() => assertPlatformExplorerNetwork(id, 'testnet')).not.toThrow();
      expect(() => assertPlatformExplorerNetwork(id, 'mainnet')).toThrow();
    }
    for (const id of [undefined, null, '', 'devnet', 'something-testnet-like']) {
      expect(() => assertPlatformExplorerNetwork(id, 'mainnet')).toThrow();
      expect(() => assertPlatformExplorerNetwork(id, 'testnet')).toThrow();
    }
  });
});
