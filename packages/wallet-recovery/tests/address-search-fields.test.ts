import { describe, expect, it } from 'vitest';
import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';
import { findDerivedAddresses } from '../src/address-search.js';

const identityHash = '00112233445566778899aabbccddeeff00112233';

const identityAdapter = {
  id: 'dash-identity',
  batchSize: 5,
  derive: ({ start }: { start: number }) => ({
    id: 'dash-identity',
    title: 'Identity',
    networkLabel: 'Dash',
    pathTemplate: 'm/9',
    basicSummary: [],
    summary: [],
    notices: [],
    rows: [
      {
        index: start,
        path: `m/9/${start}`,
        title: 'Identity candidate',
        basic: [],
        advanced: [],
        groups: [
          {
            key: 'key0',
            title: 'MASTER key',
            basic: [
              {
                key: 'key0PublicKeyHash',
                label: 'Public-key HASH160',
                value: identityHash,
                secret: false,
              },
            ],
            advanced: [],
          },
        ],
      },
    ],
  }),
} as unknown as RuntimeCoinAdapter;

describe('wallet matcher public-field targets', () => {
  it('matches a nested Dash Identity MASTER public-key HASH160 without treating it as an address', async () => {
    const matches = await findDerivedAddresses(
      identityAdapter,
      { seed: new Uint8Array([1]), network: 'mainnet', account: 0, branch: 0 },
      [{ id: 'identity-1', address: identityHash.toUpperCase(), fieldKeys: ['key0PublicKeyHash'] }],
      7,
      1,
    );
    expect(matches).toEqual([{ id: 'identity-1', index: 7, path: 'm/9/7', address: identityHash }]);
  });
});
