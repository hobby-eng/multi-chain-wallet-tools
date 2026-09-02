import { describe, expect, it } from 'vitest';
import { deriveDashPlatform } from '../src/coins/dash/platform.js';
import { mnemonicToSeed } from '@ckd/core/bip39.js';
import { rowValue, TEST_MNEMONIC } from '@ckd/test-support/helpers.js';

describe('Dash Platform DIP17/DIP18 official vectors', () => {
  it('matches the default key-class mainnet vectors', () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const result = deriveDashPlatform({ seed, network: 'mainnet', account: 0, branch: 0, start: 0, count: 2 });
    seed.fill(0);

    expect(rowValue(result, 'privateKeyHex')).toBe('6bca392f43453b7bc33a9532b69221ce74906a8815281637e0c9d0bee35361fe');
    expect(rowValue(result, 'privateKey')).toBe('6bca392f43453b7bc33a9532b69221ce74906a8815281637e0c9d0bee35361fe');
    expect(rowValue(result, 'publicKey')).toBe('03de102ed1fc43cbdb16af02e294945ffaed8e0595d3072f4c592ae80816e6859e');
    expect(rowValue(result, 'publicKeyHash')).toBe('f7da0a2b5cbd4ff6bb2c4d89b67d2f3ffeec0525');
    expect(rowValue(result, 'address')).toBe('dash1krma5z3ttj75la4m93xcndna9ullamq9y5e9n5rs');

    expect(rowValue(result, 'privateKeyHex', 1)).toBe('eef58ce73383f63d5062f281ed0c1e192693c170fbc0049662a73e48a1981523');
    expect(rowValue(result, 'address', 1)).toBe('dash1kzjl7qzxy9lar37j8r37z3kvt07epqe20ckxfezw');
  });

  it('matches the non-default key-class vector', () => {
    const seed = mnemonicToSeed(TEST_MNEMONIC);
    const result = deriveDashPlatform({ seed, network: 'mainnet', account: 0, branch: 1, start: 0, count: 1 });
    seed.fill(0);

    expect(rowValue(result, 'privateKeyHex')).toBe('cc05b4389712a2e724566914c256217685d781503d7cc05af6642e60260830db');
    expect(rowValue(result, 'address')).toBe('dash1kpkeye606ez89g7lelp7hnldwwpt76va0v3j6x28');
  });

  it('matches the platform-address vector used by Dash Desktop', () => {
    const seed = mnemonicToSeed('deliver frame tomato ring tool second dream mutual fade sponsor visa teach');
    const result = deriveDashPlatform({ seed, network: 'testnet', account: 0, branch: 0, start: 0, count: 3 });
    seed.fill(0);

    expect(rowValue(result, 'address', 0)).toBe('tdash1kr0xt5wj85ht5u464rfysjrq75rewz9mysjwf59p');
    expect(rowValue(result, 'address', 1)).toBe('tdash1kqgy7ngm2wf0zsv20k4mc62s5rapw26yeg6em4jq');
    expect(rowValue(result, 'address', 2)).toBe('tdash1kzlatzl0u06uxrqz8hkc7naz9d2g3v8g7gw83ew3');
  });
});
