/**
 * Returns bytes filled exclusively by the browser Web Crypto CSPRNG.
 * Secret generation must fail closed when the reviewed randomness source is
 * unavailable; callers must never substitute Math.random or timestamp data.
 */
export function secureRandomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0 || length > 65_536)
    throw new Error("Secure random byte length must be an integer from 0 to 65536.");
  const getRandomValues = globalThis.crypto?.getRandomValues;
  if (typeof getRandomValues !== "function")
    throw new Error("Secure randomness is unavailable: crypto.getRandomValues is required.");
  const output = new Uint8Array(length);
  getRandomValues.call(globalThis.crypto, output);
  return output;
}

/**
 * Fills `bytes` from the Web Crypto CSPRNG, for a library that asks its host for a buffer filler
 * (MnemoCode's share split); it fails closed as secureRandomBytes does.
 */
export function fillSecureRandom(bytes: Uint8Array): void {
  const random = secureRandomBytes(bytes.length);
  bytes.set(random);
  // The copy may seed secret material, such as the shares of a split.
  random.fill(0);
}

/** Bytes of each draw of the health check: an honest source never repeats so many. */
const HEALTH_DRAW_BYTES = 32;
/**
 * Zero bytes in a row that a draw may not hold: a source that fills only part of the buffer
 * leaves them, and an honest 32-byte draw holds eight in a row with a chance of about 25 · 2^-64.
 */
const EMPTY_RUN_BYTES = 8;

/**
 * A startup health check of the randomness source, in the spirit of FIPS 140's continuous test:
 * two draws must differ, neither may be one byte repeated, and neither may hold a run of zero
 * bytes. It cannot prove randomness: it catches a source that is missing, throws, returns a
 * constant or zeros, repeats its last draw or fills only part of the buffer, before a secret is
 * drawn. A source that only counts, or is predictable in another way, can pass.
 */
export function checkSecureRandom(): void {
  const first = secureRandomBytes(HEALTH_DRAW_BYTES);
  const second = secureRandomBytes(HEALTH_DRAW_BYTES);
  try {
    const repeated = (bytes: Uint8Array): boolean => bytes.every((byte) => byte === bytes[0]);
    const same = first.every((byte, index) => byte === second[index]);
    if (repeated(first) || repeated(second) || same)
      throw new Error("Secure randomness failed its health check: the source repeats itself.");
    const emptyRun = (bytes: Uint8Array): boolean =>
      bytes.some((_, start) => {
        const run = bytes.subarray(start, start + EMPTY_RUN_BYTES);
        return run.length === EMPTY_RUN_BYTES && run.every((byte) => byte === 0);
      });
    if (emptyRun(first) || emptyRun(second))
      throw new Error("Secure randomness failed its health check: part of a draw stayed empty.");
  } finally {
    first.fill(0);
    second.fill(0);
  }
}
