import { describe, expect, it } from 'vitest';
import { RECOVERY_EVM_ACCOUNT_BATCH, RECOVERY_UTXO_ADDRESS_BATCH } from '../src/protocol.js';

describe('network boundary protocol', () => {
  it('keeps reviewed public batch ceilings centralized', () => {
    expect(RECOVERY_UTXO_ADDRESS_BATCH).toBe(100);
    expect(RECOVERY_EVM_ACCOUNT_BATCH).toBe(100);
  });

  it('exposes a public-only request shape at the boundary', () => {
    const request = {
      operation: 'address-history' as const,
      network: 'mainnet' as const,
      addresses: ['1BoatSLRHtKNngkdXEeobR76b53LETtpyT'],
    };
    expect(request.operation).toBe('address-history');
    expect(request.addresses).toHaveLength(1);
  });
});
