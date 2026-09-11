import { expect, it } from 'vitest';
import { EVM_RPC_QUANTITY, isUint256Decimal, PROVIDER_UNSIGNED_DECIMAL } from '../src/numeric-limits.js';
it('accepts the entire uint256 range and rejects overflow before formatting', () => {
  expect(EVM_RPC_QUANTITY.test('0x' + 'f'.repeat(64))).toBe(true);
  expect(EVM_RPC_QUANTITY.test('0x' + 'f'.repeat(65))).toBe(false);
  expect(isUint256Decimal(((1n << 256n) - 1n).toString())).toBe(true);
  expect(isUint256Decimal((1n << 256n).toString())).toBe(false);
  expect(isUint256Decimal('9'.repeat(10000))).toBe(false);
});
it('keeps a separate bounded range for accumulated lifetime amounts', () => {
  expect(PROVIDER_UNSIGNED_DECIMAL.test('9'.repeat(100))).toBe(true);
  expect(PROVIDER_UNSIGNED_DECIMAL.test('9'.repeat(101))).toBe(false);
  for (const value of ['-1','1.2','01','1e6','']) expect(PROVIDER_UNSIGNED_DECIMAL.test(value)).toBe(false);
});
