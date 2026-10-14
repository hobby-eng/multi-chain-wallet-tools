// Base58Check: data followed by the first four bytes of its double SHA-256, in Bitcoin's alphabet
// or a coin's own. Its own module, so that the coins and the test of other coins' forms
// (other-forms.ts) share it without the Base58 coin class.
//
// Host-neutral, with @scure/base and @noble/hashes (test/portable-modules.test.ts).

import { sha256 } from "@noble/hashes/sha2.js";
import type { BytesCoder } from "@scure/base";
import { equalBytes } from "../bits.js";

/** Base58Check: four bytes of double SHA-256 close the data. */
const CHECKSUM_BYTES = 4;

/** The data of a Base58Check string, or undefined when it is not one or its checksum fails. */
export function checkedData(text: string, alphabet: BytesCoder): Uint8Array | undefined {
  let bytes: Uint8Array;
  try {
    bytes = alphabet.decode(text);
  } catch {
    return undefined;
  }
  if (bytes.length < CHECKSUM_BYTES) return undefined;
  const data = bytes.subarray(0, bytes.length - CHECKSUM_BYTES);
  const checksum = sha256(sha256(data)).subarray(0, CHECKSUM_BYTES);
  return equalBytes(bytes.subarray(data.length), checksum) ? data : undefined;
}
