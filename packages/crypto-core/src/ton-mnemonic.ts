// TON's own 24-word phrase (ton-org/ton-crypto, src/mnemonic/mnemonic.ts, read 2026-11-10), which
// the Telegram wallet and the TON standard wallets keep: words of the English BIP39 list without
// BIP39's checksum. Its entropy is HMAC-SHA512 keyed by the lowercase words joined with single
// spaces, over an empty password; a phrase is TON's when PBKDF2-SHA512(entropy, "TON seed version",
// 390) begins with a zero byte, and its Ed25519 seed is the first 32 bytes of PBKDF2-SHA512(entropy,
// "TON default seed", 100 000). A random BIP39 phrase passes that check about once in 256 draws.
// This module holds the cryptography only, which the derivation worker needs; ton-phrase.ts reads
// the words of a phrase.
import { hmac } from "@noble/hashes/hmac.js";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { wipe } from "./crypto.js";

/** ton-crypto's PBKDF_ITERATIONS, the cost of the key; the check costs a 256th of it. */
const KEY_ITERATIONS = 100_000;
const CHECK_ITERATIONS = Math.max(1, Math.floor(KEY_ITERATIONS / 256));
const CHECK_SALT = utf8ToBytes("TON seed version");
const KEY_SALT = utf8ToBytes("TON default seed");

/** The 64-byte TON entropy of normalized `words` (ton-phrase.ts tonWords); the caller wipes it. */
export function tonEntropy(words: string): Uint8Array {
  const key = utf8ToBytes(words);
  try {
    return hmac(sha512, key, new Uint8Array(0));
  } finally {
    wipe(key);
  }
}

/** Whether `entropy` is a TON phrase's: its check begins with a zero byte. */
export function isTonEntropy(entropy: Uint8Array): boolean {
  const check = pbkdf2(sha512, entropy, CHECK_SALT, { c: CHECK_ITERATIONS, dkLen: 64 });
  try {
    return check[0] === 0;
  } finally {
    wipe(check);
  }
}

/** Whether normalized TON `words` (ton-phrase.ts tonWords) pass TON's check. */
export function passesTonCheck(words: string): boolean {
  const entropy = tonEntropy(words);
  try {
    return isTonEntropy(entropy);
  } finally {
    wipe(entropy);
  }
}

/** The 32-byte Ed25519 seed of a TON phrase's `entropy`; the caller wipes it. */
export function tonKeySeed(entropy: Uint8Array): Uint8Array {
  const output = pbkdf2(sha512, entropy, KEY_SALT, { c: KEY_ITERATIONS, dkLen: 64 });
  try {
    return output.slice(0, 32);
  } finally {
    wipe(output);
  }
}
