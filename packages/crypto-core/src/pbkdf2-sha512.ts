// PBKDF2-HMAC-SHA512 by the two engines of the Deriver's wallet-check draw: the browser's WebCrypto
// and @noble/hashes. Measured on 2026-11-12 in dedicated workers on the owner's laptop, with a fresh
// password every call (Firefox answers a repeated one from a cache): WebCrypto is about 6 times
// faster per call than JavaScript (Chromium: 4,723 against 730 runs a second at 390 iterations),
// but Chromium runs every page's WebCrypto work on one thread of its own and Firefox on about two.
// JavaScript workers scale on their own cores, but run for seconds beside two WebCrypto workers
// they slowed the total under the laptop's power limit. The draw therefore runs its first two
// workers on WebCrypto and any further one in JavaScript (apps/key-derivation/src/ui/
// wallet-check-draw.ts), where only a computer with power to spare gains from them.
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { wipe } from "./crypto.js";

const BITS_PER_BYTE = 8;

/** PBKDF2-HMAC-SHA512 of `password` and `salt`: `bytes` bytes, which the caller wipes. */
export type Pbkdf2Sha512 = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  bytes: number,
) => Promise<Uint8Array>;

/** By @noble/hashes in the calling thread: slower per call, but every worker adds its own. */
export const javascriptPbkdf2Sha512: Pbkdf2Sha512 = async (password, salt, iterations, bytes) =>
  pbkdf2(sha512, password, salt, { c: iterations, dkLen: bytes });

/**
 * By the browser's WebCrypto where it has one, else by @noble/hashes. WebCrypto's key object holds
 * the password where the page cannot wipe it.
 */
export const webCryptoPbkdf2Sha512: Pbkdf2Sha512 = async (password, salt, iterations, bytes) => {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return javascriptPbkdf2Sha512(password, salt, iterations, bytes);
  // Copies over plain ArrayBuffers, the only kind WebCrypto takes; they are wiped afterwards.
  const material = new Uint8Array(password);
  const saltCopy = new Uint8Array(salt);
  try {
    const key = await subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(
      await subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-512", salt: saltCopy, iterations },
        key,
        bytes * BITS_PER_BYTE,
      ),
    );
  } finally {
    wipe(material);
    wipe(saltCopy);
  }
};
