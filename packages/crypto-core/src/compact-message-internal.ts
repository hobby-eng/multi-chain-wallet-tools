import {
  compactSigningHeader,
  readCompactHeader,
  type CompactHeaders,
  type CompactScriptType,
} from "./compact-message-headers.js";
import { concatBytes, encodeP2pkh, hash160, secp256k1, sha256 } from "./crypto.js";
import type { MessageSignature } from "./message-signature.js";
import { SigningMessage } from "./signing-message.js";

/** A compact signature: one header byte, then r and s of 32 bytes each. */
const SIGNATURE_BYTES = 65;

const REFUSALS = {
  INVALID_LENGTH: "Message length is outside the supported range.",
  INVALID_BASE64: "The compact signature is not valid Base64.",
  INVALID_SIGNATURE_LENGTH: `A compact message signature must contain exactly ${SIGNATURE_BYTES} bytes.`,
  INVALID_HEADER: "The compact signature's header is not one this format uses.",
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

/** One coin's compact format: its message magic, its headers and its address forms. */
export interface CompactMessageParameters {
  readonly magic: string;
  readonly format: string;
  /** The headers its verification reads (compact-message-headers.ts). */
  readonly headers: CompactHeaders;
  /** The script type whose header the signer writes: 31, 35 or 39 plus the recovery id. */
  readonly signingType: CompactScriptType;
  /** Every address form of `publicKey` under `type` that a signature for that type proves. */
  addresses(publicKey: Uint8Array, type: CompactScriptType): readonly string[];
}

/** A P2PKH-only format of Bitcoin Core's headers, such as Bitcoin's and Dash's. */
export function p2pkhCompactParameters(
  magic: string,
  p2pkhPrefix: number,
  format: string,
): CompactMessageParameters {
  return {
    magic,
    format,
    headers: "core",
    signingType: "p2pkh",
    addresses: (publicKey) => [encodeP2pkh(hash160(publicKey), p2pkhPrefix)],
  };
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
 * Whether `value` has the shape of a compact signature: Base64 of 65 bytes with one of Bitcoin
 * Core's headers (compact-message-headers.ts). It says nothing about validity; a verifier checks it.
 */
export function isCompactSignature(value: string): boolean {
  let signature: Uint8Array;
  try {
    signature = decodeCompactSignature(value);
  } catch {
    // Text that is not Base64 is simply not of this shape.
    return false;
  }
  return (
    signature.length === SIGNATURE_BYTES &&
    readCompactHeader(signature[0] ?? 0, "core") !== undefined
  );
}

interface RecoveredCompactPublicKey {
  readonly publicKey: Uint8Array;
  readonly compressed: boolean;
  /** The script types the header lets the signature prove. */
  readonly types: readonly CompactScriptType[];
}

/** The signer's public key, recovered as a format of `headers` reads the signature's header. */
export function recoverCompactPublicKey(
  signature: Uint8Array,
  digest: Uint8Array,
  headers: CompactHeaders = "core",
): RecoveredCompactPublicKey {
  if (signature.length !== SIGNATURE_BYTES)
    throw new CompactMessageError("INVALID_SIGNATURE_LENGTH");
  const header = readCompactHeader(signature[0] ?? 0, headers);
  if (header === undefined) throw new CompactMessageError("INVALID_HEADER");
  const { recoveryId, compressed, types } = header;
  const publicKey = secp256k1.Signature.fromBytes(signature.slice(1), "compact")
    .addRecoveryBit(recoveryId)
    .recoverPublicKey(digest)
    .toBytes(compressed);
  if (!secp256k1.verify(signature.slice(1), digest, publicKey, { prehash: false, lowS: false })) {
    throw new CompactMessageError("RECOVERY_FAILED");
  }
  return { publicKey, compressed, types };
}

/** Whether the signature's key, under a type its header names, has the address `address`. */
function provesAddress(
  signature: Uint8Array,
  digest: Uint8Array,
  parameters: CompactMessageParameters,
  address: string,
): boolean {
  const { publicKey, types } = recoverCompactPublicKey(signature, digest, parameters.headers);
  return types.some((type) => parameters.addresses(publicKey, type).includes(address));
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
  const signatureBytes = concatBytes(
    Uint8Array.of(compactSigningHeader(recovery, parameters.signingType)),
    recovered.slice(1),
  );
  try {
    const signature = base64Encode(signatureBytes);
    if (!provesAddress(signatureBytes, digest, parameters, address)) {
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
    try {
      return provesAddress(signatureBytes, digest, parameters, address.trim());
    } catch (cause) {
      if (cause instanceof CompactMessageError) throw cause;
      // Pasted bytes can name no point at all (r = 0, or r off the curve): noble then refuses them.
      throw new CompactMessageError("RECOVERY_FAILED");
    }
  } finally {
    digest.fill(0);
    signatureBytes.fill(0);
  }
}
