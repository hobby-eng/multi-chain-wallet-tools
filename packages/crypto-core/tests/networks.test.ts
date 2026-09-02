import { describe, expect, it } from 'vitest';
import { getBitcoinNetwork, getDashNetwork } from '../src/networks.js';

describe('network registry', () => {
  it('returns audited network parameters and rejects unknown names', () => {
    expect(getBitcoinNetwork('mainnet').p2pkh).toBe(0x00);
    expect(getDashNetwork('mainnet').p2pkh).toBe(76);
    expect(() => getDashNetwork('devnet' as 'mainnet')).toThrow('Unsupported Dash network: devnet.');
  });
});
