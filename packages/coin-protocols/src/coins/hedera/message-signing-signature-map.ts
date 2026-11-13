// The protobuf SignatureMap that hedera_signMessage returns in Base64 (HAPI basic_types.proto:
// SignatureMap { repeated SignaturePair sigPair = 1 }, SignaturePair { bytes pubKeyPrefix = 1;
// oneof signature { bytes ed25519 = 3; bytes ECDSA_secp256k1 = 6; ... } }), for the one pair a
// key writes: its full public key as the prefix, and its 64-byte signature. The reader is strict:
// only those fields, one-byte lengths, and the signature of the format's key type; like
// hedera-wallet-connect's verifyMessageSignature, it reads the first pair and trusts no prefix.
import { base64 } from "@scure/base";
import { concatBytes } from "@ckd/core/crypto.js";
import { base64Signature } from "../message-signing-response.js";

/** The key types of the Deriver's Hedera rows. */
export type SignatureMapKind = "ed25519" | "ecdsa";

/** Protobuf's length-delimited wire type. */
const LENGTH_DELIMITED = 2;
/** SignatureMap.sigPair and SignaturePair.pubKeyPrefix. */
const PAIR_FIELD = 1;
const PREFIX_FIELD = 1;
/** The SignaturePair field of each key type's signature. */
const SIGNATURE_FIELD: Readonly<Record<SignatureMapKind, number>> = Object.freeze({
  ed25519: 3,
  ecdsa: 6,
});
const SIGNATURE_BYTES = 64;
/** The longest length that one varint byte writes. */
const ONE_BYTE_LENGTH = 0x7f;

/** One length-delimited field: its tag byte, its one-byte length and its bytes. */
function lengthDelimited(field: number, bytes: Uint8Array): Uint8Array {
  return concatBytes(Uint8Array.of((field << 3) | LENGTH_DELIMITED, bytes.length), bytes);
}

/** The Base64 SignatureMap of one key's signature, as hedera-wallet-connect's wallet writes it. */
export function writeSignatureMap(
  kind: SignatureMapKind,
  publicKey: Uint8Array,
  signature: Uint8Array,
): string {
  const pair = concatBytes(
    lengthDelimited(PREFIX_FIELD, publicKey),
    lengthDelimited(SIGNATURE_FIELD[kind], signature),
  );
  return base64.encode(lengthDelimited(PAIR_FIELD, pair));
}

/** The length-delimited fields of `bytes`, or undefined for any other encoding. */
function fields(bytes: Uint8Array): { field: number; value: Uint8Array }[] | undefined {
  const found: { field: number; value: Uint8Array }[] = [];
  let at = 0;
  while (at < bytes.length) {
    const tag = bytes[at] ?? 0;
    const length = bytes[at + 1];
    if ((tag & 7) !== LENGTH_DELIMITED || length === undefined || length > ONE_BYTE_LENGTH)
      return undefined;
    if (at + 2 + length > bytes.length) return undefined;
    found.push({ field: tag >> 3, value: bytes.subarray(at + 2, at + 2 + length) });
    at += 2 + length;
  }
  return found;
}

/**
 * The 64-byte signature of a pasted SignatureMap's first pair, for the key type `kind`, or of a
 * bare Base64 signature; undefined for any other text. A map is never 64 bytes: its prefix and
 * tags alone take more than 32.
 */
export function readSignatureMap(kind: SignatureMapKind, text: string): Uint8Array | undefined {
  const bare = base64Signature(text);
  if (bare !== undefined) return bare;
  const trimmed = text.trim();
  if (!/^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(trimmed))
    return undefined;
  const pairs = fields(base64.decode(trimmed));
  const first = pairs?.[0];
  if (first === undefined || pairs?.some(({ field }) => field !== PAIR_FIELD) === true)
    return undefined;
  const members = fields(first.value);
  const own = (field: number) => field === PREFIX_FIELD || field === SIGNATURE_FIELD[kind];
  if (members === undefined || !members.every(({ field }) => own(field))) return undefined;
  const signature = members.find(({ field }) => field === SIGNATURE_FIELD[kind])?.value;
  return signature?.length === SIGNATURE_BYTES ? signature.slice() : undefined;
}
