// The hex spellings of public key material as people paste them: an optional 0x and either case.
// Each tool that reads such a value tells the kinds apart with these patterns, so that a page, a
// detector and a provider client accept exactly the same text.

/** A 20-byte HASH160, such as the fingerprint of a public key. */
export const HASH160_HEX = /^(?:0x)?[0-9a-f]{40}$/iu;
/** A 33-byte compressed secp256k1 public key (SEC1). */
export const COMPRESSED_KEY_HEX = /^(?:0x)?0[23][0-9a-f]{64}$/iu;
/** A compressed or a 65-byte uncompressed secp256k1 public key (SEC1). */
export const SEC1_KEY_HEX = /^(?:0x)?(?:04[0-9a-f]{128}|0[23][0-9a-f]{64})$/iu;
/** A 48-byte BLS12-381 public key. */
export const BLS_KEY_HEX = /^(?:0x)?[0-9a-f]{96}$/iu;

/** The canonical form of pasted hex: no 0x, no spaces, lower case. */
export function normalizedHex(value: string): string {
  return value.trim().replace(/^0x/iu, "").replace(/\s+/gu, "").toLowerCase();
}
