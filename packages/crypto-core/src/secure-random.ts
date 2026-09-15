/**
 * Returns bytes filled exclusively by the browser Web Crypto CSPRNG.
 * Secret generation must fail closed when the reviewed randomness source is
 * unavailable; callers must never substitute Math.random or timestamp data.
 */
export function secureRandomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0 || length > 65_536)
    throw new Error('Secure random byte length must be an integer from 0 to 65536.');
  const getRandomValues = globalThis.crypto?.getRandomValues;
  if (typeof getRandomValues !== 'function')
    throw new Error('Secure randomness is unavailable: crypto.getRandomValues is required.');
  const output = new Uint8Array(length);
  getRandomValues.call(globalThis.crypto, output);
  return output;
}
