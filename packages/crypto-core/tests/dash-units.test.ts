import { CREDITS_PER_DASH, DUFFS_PER_DASH, formatDashCredits, formatDashDuffs } from '../src/dash-units.js';
import { describe, expect, it } from 'vitest';

describe('Dash monetary units', () => {
  it('keeps Core duffs and Platform/Orchard credits distinct and exact', () => {
    expect(DUFFS_PER_DASH).toBe(100_000_000n);
    expect(CREDITS_PER_DASH).toBe(100_000_000_000n);
    expect(formatDashDuffs(123_456_789n)).toBe('1.23456789 DASH');
    expect(formatDashCredits(123_456_789_012n)).toBe('1.23456789012 DASH');
  });

  it('formats signed balance changes without floating-point conversion', () => {
    expect(formatDashDuffs(-1n, true)).toBe('-0.00000001 DASH');
    expect(formatDashDuffs(1n, true)).toBe('+0.00000001 DASH');
    expect(formatDashCredits(0n, true)).toBe('0 DASH');
  });
});
