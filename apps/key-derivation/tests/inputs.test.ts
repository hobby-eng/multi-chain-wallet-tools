import { describe, expect, it } from 'vitest';
import { getCoinAdapter } from '@ckd/coins/registry.js';
import { readControls, type DerivationControls } from '../src/ui/inputs.js';

function controls(count: string, start = '0', includeChange = false, branch = '0'): DerivationControls {
  return {
    network: { value: 'mainnet' },
    account: { value: '0' },
    branchInput: { value: branch },
    branchSelect: { value: branch },
    includeChange: { checked: includeChange },
    start: { value: start },
    count: { value: count },
  } as unknown as DerivationControls;
}

describe('user-visible derivation count', () => {
  it('accepts 10,000 results and leaves batching to the adapter orchestrator', () => {
    const input = readControls(getCoinAdapter('bitcoin-native-segwit'), controls('10000'));
    expect(input.count).toBe(10_000);
    expect(input.includeChange).toBe(false);
  });

  it('retains only protocol index-space bounds, not the former 50-result limit', () => {
    expect(() => readControls(getCoinAdapter('bitcoin-native-segwit'), controls('2147483649'))).toThrow(/1 to 2147483648/u);
    expect(() => readControls(getCoinAdapter('bitcoin-native-segwit'), controls('2', '2147483647'))).toThrow(/range exceeds/u);
  });

  it('exposes the optional change branch only for adapters that declare it', () => {
    const bitcoin = readControls(getCoinAdapter('bitcoin-taproot'), controls('20', '0', true));
    const dash = readControls(getCoinAdapter('dash-core'), controls('20', '0', true));
    const ethereum = readControls(getCoinAdapter('ethereum'), controls('20', '0', true, '1'));

    expect(bitcoin).toMatchObject({ branch: 0, includeChange: true });
    expect(dash).toMatchObject({ branch: 0, includeChange: true });
    expect(ethereum).toMatchObject({ branch: 1, includeChange: false });
  });
});
