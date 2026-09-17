import { describe, expect, it } from 'vitest';
import {
  assertPublicToken,
  assertPublicTokenBatch,
  assertRecoveryNetwork,
  exactNetworkPayload,
  validateNetworkRequest,
} from '../src/request-validation.js';

const validators = {
  ping: (value: unknown) => void exactNetworkPayload(value, []),
  lookup: (value: unknown) => {
    const body = exactNetworkPayload(value, ['network', 'addresses']);
    assertRecoveryNetwork(body.network);
    assertPublicTokenBatch(body.addresses, 2);
  },
  history: (value: unknown) => {
    const body = exactNetworkPayload(value, ['network', 'address']);
    assertRecoveryNetwork(body.network);
    assertPublicToken(body.address, 'Address');
  },
};
const request = (operation: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: 'boundary-1',
  operation,
  payload,
  ...extra,
});

describe('network-boundary untrusted request validation', () => {
  it('accepts only exact public DTOs in the supplied build allowlist', () => {
    for (const value of [
      request('ping', {}),
      request('lookup', { network: 'mainnet', addresses: ['public-1', 'public-2'] }),
      request('history', { network: 'testnet', address: 'public-address' }),
    ]) {
      expect(validateNetworkRequest(value, validators)).toEqual(value);
    }
  });

  it.each([
    request('history', { network: 'mainnet', address: 'abandon abandon abandon' }),
    request('lookup', { network: 'mainnet', addresses: ['public'], mnemonic: 'secret' }),
    request('lookup', { network: 'mainnet', addresses: ['one', 'two', 'three'] }),
    request('unknown.operation', {}),
    request('ping', {}, { privateKey: 'secret' }),
  ])('rejects malformed, oversized, secret-shaped, extended, or disabled DTOs before dispatch', (value) => {
    expect(() => validateNetworkRequest(value, validators)).toThrow();
  });

  it.each(['toString', 'constructor', '__proto__'])('rejects inherited object keys as operations: %s', (operation) => {
    expect(() => validateNetworkRequest(request(operation, {}), validators)).toThrow('not supported by this build');
  });
});
