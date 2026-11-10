// A Solana address: the base58 of a 32-byte Ed25519 public key, without a checksum.
import { base58 } from "@scure/base";

/** The address of a 32-byte Ed25519 public key. */
export function solanaAddress(publicKey: Uint8Array): string {
  return base58.encode(publicKey);
}

/** The 32 bytes of a Solana address, or null when `value` is not base58 of 32 bytes. */
export function solanaPublicKeyOf(value: string): Uint8Array | null {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/u.test(value)) return null;
  try {
    const bytes = base58.decode(value);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}
