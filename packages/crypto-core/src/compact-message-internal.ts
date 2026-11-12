import { concatBytes, encodeP2pkh, hash160, secp256k1, sha256 } from "./crypto.js";
import type { MessageSignature } from "./message-signature.js";
import { SigningMessage } from "./signing-message.js";

/** A compact signature: one header byte, then r and s of 32 bytes each. */
const SIGNATURE_BYTES = 65;
/** The headers of Bitcoin Core's compact signatures: 27 + recovery id, + 4 for a compressed key. */
const FIRST_HEADER = 27;
const LAST_HEADER = 34;

const REFUSALS = {
  INVALID_LENGTH: "Message length is outside the supported range.",
  INVALID_BASE64: "The compact signature is not valid Base64.",
  INVALID_SIGNATURE_LENGTH: `A compact message signature must contain exactly ${SIGNATURE_BYTES} bytes.`,
  INVALID_HEADER: `Compact message signature header must be from ${FIRST_HEADER} to ${LAST_HEADER}.`,
  RECOVERY_FAILED: "No public key can be recovered from this compact signature.",
  INVALID_KEY: "Message signing requires a 32-byte private key.",
  SIGNING_FAILED: "The generated signature did not verify against the selected address.",
} as const;

/** Stable, input-free refusals from compact-message encoding, signing and recovery. */
export class CompactMessageError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "CompactMessageError";
    this.code = code;
  }
}

export interface CompactMessageParameters {
  readonly magic: string;
  readonly p2pkhPrefix: number;
  readonly format: string;
}

function compactSize(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) throw new CompactMessageError("INVALID_LENGTH");
  if (value < 0xfd) return Uint8Array.of(value);
  if (value <= 0xffff) return Uint8Array.of(0xfd, value & 0xff, value >>> 8);
  if (value <= 0xffff_ffff) {
    return Uint8Array.of(
      0xfe,
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      value >>> 24,
    );
  }
  const bytes = new Uint8Array(9);
  bytes[0] = 0xff;
  let remaining = BigInt(value);
  for (let index = 1; index < bytes.length; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

export function compactMessageDigest(message: string, magicText: string): Uint8Array {
  SigningMessage.require(message, true);
  const encoder = new TextEncoder();
  const magic = encoder.encode(magicText);
  const payload = encoder.encode(message);
  return sha256(
    sha256(concatBytes(compactSize(magic.length), magic, compactSize(payload.length), payload)),
  );
}

function base64Encode(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeCompactSignature(value: string): Uint8Array {
  try {
    const binary = atob(value.replaceAll(/\s+/gu, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new CompactMessageError("INVALID_BASE64");
  }
}

/**
 * Whether `value` has the shape of a compact signature: Base64 of 65 bytes whose header is from 27
 * to 34. It says nothing about validity; a verifier checks that.
 */
export function isCompactSignature(value: string): boolean {
  let signature: Uint8Array;
  try {
    signature = decodeCompactSignature(value);
  } catch {
    // Text that is not Base64 is simply not of this shape.
    return false;
  }
  const header = signature[0];
  return (
    signature.length === SIGNATURE_BYTES &&
    header !== undefined &&
    header >= FIRST_HEADER &&
    header <= LAST_HEADER
  );
}

interface RecoveredCompactPublicKey {
  readonly publicKey: Uint8Array;
  readonly compressed: boolean;
}

export function recoverCompactPublicKey(
  signature: Uint8Array,
  digest: Uint8Array,
): RecoveredCompactPublicKey {
  if (signature.length !== SIGNATURE_BYTES)
    throw new CompactMessageError("INVALID_SIGNATURE_LENGTH");
  const header = signature[0];
  if (header === undefined || header < FIRST_HEADER || header > LAST_HEADER)
    throw new CompactMessageError("INVALID_HEADER");
  const offset = header - FIRST_HEADER;
  const compressed = offset >= 4;
  const publicKey = secp256k1.Signature.fromBytes(signature.slice(1), "compact")
    .addRecoveryBit(offset & 3)
    .recoverPublicKey(digest)
    .toBytes(compressed);
  if (!secp256k1.verify(signature.slice(1), digest, publicKey, { prehash: false, lowS: false })) {
    throw new CompactMessageError("RECOVERY_FAILED");
  }
  return { publicKey, compressed };
}

function recoveredAddress(signature: Uint8Array, digest: Uint8Array, p2pkhPrefix: number): string {
  const { publicKey } = recoverCompactPublicKey(signature, digest);
  return encodeP2pkh(hash160(publicKey), p2pkhPrefix);
}

export function signCompactMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  parameters: CompactMessageParameters,
): MessageSignature {
  if (
    privateKey.length !== secp256k1.Point.Fn.BYTES ||
    !secp256k1.utils.isValidSecretKey(privateKey)
  )
    throw new CompactMessageError("INVALID_KEY");
  SigningMessage.require(message);
  const digest = compactMessageDigest(message, parameters.magic);
  const recovered = secp256k1.sign(digest, privateKey, { prehash: false, format: "recovered" });
  const recovery = recovered[0];
  if (recovery === undefined) throw new CompactMessageError("SIGNING_FAILED");
  const signatureBytes = concatBytes(Uint8Array.of(31 + recovery), recovered.slice(1));
  try {
    const signature = base64Encode(signatureBytes);
    if (recoveredAddress(signatureBytes, digest, parameters.p2pkhPrefix) !== address) {
      throw new CompactMessageError("SIGNING_FAILED");
    }
    return { signature, format: parameters.format, verified: true };
  } finally {
    signatureBytes.fill(0);
    digest.fill(0);
  }
}

export function verifyCompactMessage(
  address: string,
  message: string,
  signature: string,
  parameters: CompactMessageParameters,
): boolean {
  const digest = compactMessageDigest(message, parameters.magic);
  const signatureBytes = decodeCompactSignature(signature);
  try {
    let recovered: string;
    try {
      recovered = recoveredAddress(signatureBytes, digest, parameters.p2pkhPrefix);
    } catch (cause) {
      if (cause instanceof CompactMessageError) throw cause;
      // Pasted bytes can name no point at all (r = 0, or r off the curve): noble then refuses them.
      throw new CompactMessageError("RECOVERY_FAILED");
    }
    return recovered === address.trim();
  } finally {
    digest.fill(0);
    signatureBytes.fill(0);
  }
}
