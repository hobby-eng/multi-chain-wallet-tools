export const DUFFS_PER_DASH = 100_000_000n;
export const CREDITS_PER_DASH = 100_000_000_000n;

function formatDashAtomic(value: bigint, divisor: bigint, fractionDigits: number, signed: boolean): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / divisor;
  const fraction = (absolute % divisor).toString().padStart(fractionDigits, '0').replace(/0+$/u, '');
  const amount = fraction.length === 0 ? `${whole}` : `${whole}.${fraction}`;
  const sign = negative ? '-' : signed && value > 0n ? '+' : '';
  return `${sign}${amount} DASH`;
}

export function formatDashDuffs(value: bigint, signed = false): string {
  return formatDashAtomic(value, DUFFS_PER_DASH, 8, signed);
}

export function formatDashCredits(value: bigint, signed = false): string {
  return formatDashAtomic(value, CREDITS_PER_DASH, 11, signed);
}
