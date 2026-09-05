import { describe, expect, it } from 'vitest';
import { createRecoveryCoinRegistry } from '../src/coins/registry.js';
import type { RecoveryCoinAdapter } from '../src/types.js';

function adapter(id: string): RecoveryCoinAdapter {
  return {
    id,
    label: id,
    networks: ['mainnet'],
    async scan() {
      throw new Error('Stub adapter must not scan.');
    },
  };
}

describe('recovery coin registry', () => {
  it('lists and resolves explicitly registered adapters', () => {
    const registry = createRecoveryCoinRegistry([adapter('dash')]);
    expect(registry.listRecoveryCoins().map(({ id }) => id)).toEqual(['dash']);
    expect(registry.getRecoveryCoin('dash').label).toBe('dash');
    expect(() => registry.getRecoveryCoin('bitcoin')).toThrow('Unsupported recovery coin');
  });

  it('rejects duplicate adapter ids', () => {
    expect(() => createRecoveryCoinRegistry([adapter('dash'), adapter('dash')]))
      .toThrow('Recovery coin adapter dash is already registered');
  });
});
