import { describe, expect, it, vi } from 'vitest';
import type { CoinAdapter } from '@ckd/coins/registry.js';
import { createLargeRequestPolicy } from '../src/ui/large-request-policy.js';
import type { DerivationControlValues } from '../src/ui/inputs.js';

const adapter = {
  id: 'bitcoin-bip44',
  batchSize: 50,
  addressBranches: { receive: 0, change: 1 },
} as unknown as CoinAdapter;

function input(count: number, includeChange = false): DerivationControlValues {
  return {
    network: 'mainnet',
    account: 0,
    branch: 0,
    start: 0,
    count,
    includeChange,
    includeCoinJoin: false,
  };
}

describe('large request policy', () => {
  it('allows remembered ranges below the large-request threshold to run automatically', () => {
    const showStatus = vi.fn();
    const policy = createLargeRequestPolicy({
      adapter: () => adapter,
      activeFeatureTab: () => null,
      showConfirmation: vi.fn(),
      showStatus,
    });

    expect(policy.authorize(input(1000, true), true)).toBe(true);
    expect(showStatus).not.toHaveBeenCalled();
  });

  it('keeps the explicit two-step confirmation for extreme automatic requests', () => {
    const showConfirmation = vi.fn();
    const showStatus = vi.fn();
    const policy = createLargeRequestPolicy({
      adapter: () => adapter,
      activeFeatureTab: () => null,
      showConfirmation,
      showStatus,
    });
    const request = input(5000, true);

    expect(policy.authorize(request, true)).toBe(false);
    expect(showConfirmation).not.toHaveBeenCalled();
    expect(showStatus).toHaveBeenCalledWith(expect.stringContaining('10,000 results'));
    expect(policy.authorize(request, false)).toBe(false);
    expect(showConfirmation).toHaveBeenCalledOnce();
    expect(policy.authorize(request, false)).toBe(true);
  });
});
