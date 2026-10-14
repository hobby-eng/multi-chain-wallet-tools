export const DUFFS_PER_DASH = 100_000_000n;
export const CREDITS_PER_DASH = 100_000_000_000n;
export const CREDITS_PER_DUFF = CREDITS_PER_DASH / DUFFS_PER_DASH;

export function formatDashDuffs(value: bigint, signed = false): string {
  return `${AtomicAmount.format(value, 8, { signed })} DASH`;
}

export function formatDashCredits(value: bigint, signed = false): string {
  return `${AtomicAmount.format(value, 11, { signed })} DASH`;
}
import { AtomicAmount } from "./atomic-amount.js";
