import { BIP32_BRANCH_SIZE } from "@ckd/core/bip32-limits.js";

export const ADDRESS_DISCOVERY_GAP = 20;

/** Extends a scan to preserve a full empty gap after the last used address. */
export function extendAddressTarget(
  currentTarget: number,
  usedIndex: number,
  maximumCount = BIP32_BRANCH_SIZE,
): { target: number; truncated: boolean } {
  const desired = usedIndex + 1 + ADDRESS_DISCOVERY_GAP;
  return {
    target: Math.max(currentTarget, Math.min(maximumCount, desired)),
    truncated: desired > maximumCount,
  };
}

/**
 * The address targets of one scan section: each extended past a used address, remembering whether
 * the end of the index space cut one gap short, which the section then reports.
 */
export class AddressGapTracker {
  #truncated = false;

  /** `target`, extended to keep a full gap after the used address at `usedIndex`. */
  extend(target: number, usedIndex: number, maximumCount = BIP32_BRANCH_SIZE): number {
    const extension = extendAddressTarget(target, usedIndex, maximumCount);
    this.#truncated ||= extension.truncated;
    return extension.target;
  }

  get truncated(): boolean {
    return this.#truncated;
  }

  /** The section's warning when a gap was cut short; undefined otherwise. */
  get warning(): string | undefined {
    return this.#truncated
      ? `A used address was found too close to the scan profile's maximum or the end of the BIP32 index space to complete the ${ADDRESS_DISCOVERY_GAP}-address post-use gap.`
      : undefined;
  }
}
