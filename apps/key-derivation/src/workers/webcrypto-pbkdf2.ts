// BIP39's PBKDF2-HMAC-SHA512 through WebCrypto for MnemoCode's wallet checks in a worker: much
// faster than a script implementation, and it answers with a promise, which the library's
// matchAsync and fingerprintAsync take.
const encoder = new TextEncoder();

export async function webCryptoPbkdf2(
  password: string,
  salt: string,
  rounds: number,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-512", salt: encoder.encode(salt), iterations: rounds },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}
