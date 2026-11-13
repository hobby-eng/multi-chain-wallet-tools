// Stellar's SEP-53 "Sign and Verify Messages" (Final, v1.0.0, sep-0053.md at ced008c3, read
// 2026-11-11): Ed25519 over SHA-256 of "Stellar Signed Message:\n" and the message, with no length
// field. Freighter, the Stellar SDKs and stellar-cli's message sign write it.
import { concatBytes, sha256 } from "@ckd/core/crypto.js";

const PREFIX = new TextEncoder().encode("Stellar Signed Message:\n");

/** The 32 bytes SEP-53 signs for `message`. */
export function sep53SignedBytes(message: Uint8Array): Uint8Array {
  const payload = concatBytes(PREFIX, message);
  try {
    return sha256(payload);
  } finally {
    payload.fill(0);
  }
}
