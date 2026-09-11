/** Bounds apply before parsing or formatting untrusted provider amounts. */
export const MAX_PROVIDER_DECIMAL_DIGITS = 100;
export const PROVIDER_UNSIGNED_DECIMAL = new RegExp(`^(?:0|[1-9][0-9]{0,${MAX_PROVIDER_DECIMAL_DIGITS - 1}})$`, 'u');
export const PROVIDER_SIGNED_DECIMAL = new RegExp(`^-?[0-9]{1,${MAX_PROVIDER_DECIMAL_DIGITS}}$`, 'u');
export const MAX_PROVIDER_INTEGER = 10n ** BigInt(MAX_PROVIDER_DECIMAL_DIGITS) - 1n;
export const EVM_RPC_QUANTITY = /^0x[0-9a-f]{1,64}$/u;
const MAX_UINT256 = (1n << 256n) - 1n;

export function isUint256Decimal(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 78 && PROVIDER_UNSIGNED_DECIMAL.test(value) && BigInt(value) <= MAX_UINT256;
}
