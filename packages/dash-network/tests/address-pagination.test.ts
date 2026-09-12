import { describe, expect, it } from 'vitest';
import { validateAddressHistoryPage } from '../src/provider-json.js';

const row = (n: number) => ({ hash: n.toString(16).padStart(64, '0') });
describe('whole address-history page integrity', () => {
  it('rejects oversized pages and rows beyond the advertised total', () => {
    expect(() => validateAddressHistoryPage([row(0), row(1)], 2, 2, 1, new Set())).toThrow(/oversized/);
    expect(() => validateAddressHistoryPage([row(0), row(1)], 1, 1, 100, new Set())).toThrow(/exceeded/);
  });
  it('rejects malformed pages, totals and transaction hashes', () => {
    expect(() => validateAddressHistoryPage(null, 0, 0, 100, new Set())).toThrow(/invalid/);
    for (const total of [null, undefined, '1', -1, 1.5]) {
      expect(() => validateAddressHistoryPage([row(0)], total, 1, 100, new Set())).toThrow(/total/);
    }
    for (const hash of ['', 'unknown', 'zz'.repeat(32)]) {
      expect(() => validateAddressHistoryPage([{ hash }], 1, 1, 100, new Set())).toThrow(/transaction ID/);
    }
  });
  it('checks duplicates beyond the displayed prefix and across successive pages', () => {
    expect(() => validateAddressHistoryPage([row(0), row(1), row(1)], 3, 3, 100, new Set())).toThrow(/repeated/);
    const seen = new Set<string>();
    validateAddressHistoryPage([row(10)], 2, 2, 1, seen);
    expect(() => validateAddressHistoryPage([{ hash: row(10).hash.toUpperCase() }], 2, 2, 1, seen)).toThrow(/repeated/);
  });
});
