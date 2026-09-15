import { MAX_BIP32_INDEX } from '@ckd/core/bip32.js';

export const ADDRESS_DISCOVERY_GAP = 20;

/** Extends a scan to preserve a full empty gap after the last used address. */
export function extendAddressTarget(currentTarget: number, usedIndex: number): { target: number; truncated: boolean } {
  const maximumCount = MAX_BIP32_INDEX + 1;
  const desired = usedIndex + 1 + ADDRESS_DISCOVERY_GAP;
  return {
    target: Math.max(currentTarget, Math.min(maximumCount, desired)),
    truncated: desired > maximumCount,
  };
}
