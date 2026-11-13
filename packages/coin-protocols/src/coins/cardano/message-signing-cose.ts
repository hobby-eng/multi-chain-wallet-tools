// The COSE structures of CIP-30's signData (cardano-foundation/CIPs @7720fed CIP-0030/README.md
// L354-368; CIP-0008/README.md): a COSE_Sign1 whose protected header names EdDSA and the address,
// and the COSE_Key of the Ed25519 key that signed. The signature covers the Sig_structure
// ["Signature1", protected header as received, h'', payload], so a reader keeps the protected
// header's bytes as they came. Every structure is read strictly (message-signing-cbor.ts): a key or
// a header entry that CIP-8 does not define is refused, never skipped.
import { ed25519 } from "@noble/curves/ed25519.js";
import { blake2b } from "@noble/hashes/blake2.js";
import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import { CborMap, decodeCbor, encodeCbor, type CborValue } from "./message-signing-cbor.js";

/** COSE's labels and values that CIP-8 uses (RFC 9052 and RFC 9053). */
const LABEL = Object.freeze({ algorithm: 1, keyId: 4, keyType: 1, keyKeyId: 2, keyAlgorithm: 3 });
const EDDSA = -8;
const OKP = 1;
const ED25519 = 6;
/** The COSE_Key labels of an OKP key's curve and its x (RFC 9053 section 7.2). */
const OKP_LABEL = Object.freeze({ curve: -1, x: -2 });
/** CIP-8's own header labels. */
const ADDRESS = "address";
const HASHED = "hashed";
/** COSE_Sign1's tag (RFC 9052), admitted around the array and nowhere else. */
const COSE_SIGN1_TAG = 18;
const SIGNATURE_CONTEXT = "Signature1";
const SIGNATURE_BYTES = 64;
const PUBLIC_KEY_BYTES = 32;
/** CIP-8's hashed payload: BLAKE2b-224 of the message. */
const HASHED_PAYLOAD_BYTES = 28;
/** RFC 8032's strict verification: canonical encodings only, as libsodium verifies. */
const STRICT = Object.freeze({ zip215: false });

const ERRORS = new ErrorCatalog("cardano.cose", {
  structure: {
    kind: "range",
    text: () => "The COSE structure is not CIP-8's: an entry is missing, of another type or extra.",
  },
});

/** Whether `cause` is a refusal of a COSE structure. */
export function isCoseError(cause: unknown): boolean {
  return ERRORS.matches(cause, ["structure"]);
}

function refuse(): never {
  throw ERRORS.create("structure", []);
}

/** The bytes of `value`, refused unless it is a byte string of `length` bytes, when given. */
function bytesOf(value: CborValue | undefined, length?: number): Uint8Array {
  if (!(value instanceof Uint8Array) || (length !== undefined && value.length !== length)) refuse();
  return value;
}

/** Whether `value` is an array. */
function isList(value: CborValue): value is readonly CborValue[] {
  return Array.isArray(value);
}

/** `value` as a map whose keys are among `allowed` and include every one of `required`. */
function mapOf(
  value: CborValue | undefined,
  required: readonly (string | number)[],
  allowed: readonly (string | number)[],
): CborMap {
  if (!(value instanceof CborMap)) refuse();
  const keys = value.keys();
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !keys.includes(key)))
    refuse();
  return value;
}

/** CIP-8's protected header for `address`: {1: -8 (EdDSA), "address": its bytes}. */
export function protectedHeader(address: Uint8Array): Uint8Array {
  return encodeCbor(
    new CborMap([
      [LABEL.algorithm, EDDSA],
      [ADDRESS, address],
    ]),
  );
}

/** The bytes that a COSE_Sign1's signature covers (RFC 9052 section 4.4), without external data. */
export function sigStructure(protectedBytes: Uint8Array, payload: Uint8Array): Uint8Array {
  return encodeCbor([SIGNATURE_CONTEXT, protectedBytes, new Uint8Array(0), payload]);
}

/** The COSE_Sign1 of a payload carried in it and not hashed, as CIP-30's wallets return it. */
export function coseSign1(
  protectedBytes: Uint8Array,
  payload: Uint8Array,
  signature: Uint8Array,
): Uint8Array {
  return encodeCbor([protectedBytes, new CborMap([[HASHED, false]]), payload, signature]);
}

/** The COSE_Key of an Ed25519 public key: {1: 1 (OKP), 3: -8 (EdDSA), -1: 6 (Ed25519), -2: x}. */
export function coseKey(publicKey: Uint8Array): Uint8Array {
  return encodeCbor(
    new CborMap([
      [LABEL.keyType, OKP],
      [LABEL.keyAlgorithm, EDDSA],
      [OKP_LABEL.curve, ED25519],
      [OKP_LABEL.x, publicKey],
    ]),
  );
}

/** A COSE_Sign1 of CIP-8, read strictly. */
export interface CoseSign1 {
  /** The protected header's bytes as received, which the signature covers. */
  readonly protectedBytes: Uint8Array;
  /** The address the header names. */
  readonly address: Uint8Array;
  /** The payload, or null when it is detached (the message itself is then signed). */
  readonly payload: Uint8Array | null;
  /** Whether the payload is the message's BLAKE2b-224 rather than the message (CIP-8 "hashed"). */
  readonly hashed: boolean;
  readonly signature: Uint8Array;
  /** The protected header's key id (4), which CIP-30's wallets set to the address, if any. */
  readonly keyId: Uint8Array | undefined;
}

/** A COSE_Key of CIP-8, read strictly: the public key and its key id (2), if any. */
export interface CoseKey {
  readonly publicKey: Uint8Array;
  readonly keyId: Uint8Array | undefined;
}

/** The key id `value` names, a byte string, or undefined when it is absent. */
function keyIdOf(value: CborValue | undefined): Uint8Array | undefined {
  return value === undefined ? undefined : bytesOf(value);
}

/**
 * The COSE_Sign1 of `bytes`, tagged 18 or not: its protected header {1: -8, "address": bytes}
 * with at most a key id (4), its unprotected header empty or {"hashed": bool}, a payload or null,
 * and a 64-byte signature. Refuses every other structure (cardano.cose.structure) or encoding
 * (cardano.cbor).
 */
export function readCoseSign1(bytes: Uint8Array): CoseSign1 {
  const value = decodeCbor(bytes, [COSE_SIGN1_TAG]);
  if (!isList(value) || value.length !== 4) refuse();
  const [protectedValue, unprotectedValue, payload, signature] = value;
  const protectedBytes = bytesOf(protectedValue);
  const header = mapOf(
    decodeCbor(protectedBytes),
    [LABEL.algorithm, ADDRESS],
    [LABEL.algorithm, LABEL.keyId, ADDRESS],
  );
  if (header.get(LABEL.algorithm) !== EDDSA) refuse();
  const unprotected = mapOf(unprotectedValue, [], [HASHED]);
  // CIP-8's "hashed" is a boolean when present; null or any other value is refused, not read as false.
  const hashed = unprotected.get(HASHED);
  if (hashed !== undefined && typeof hashed !== "boolean") refuse();
  return {
    protectedBytes,
    address: bytesOf(header.get(ADDRESS)),
    payload: payload === null ? null : bytesOf(payload),
    hashed: hashed === true,
    signature: bytesOf(signature, SIGNATURE_BYTES),
    keyId: keyIdOf(header.get(LABEL.keyId)),
  };
}

/**
 * The COSE_Key of `bytes`: {1: 1, 3: -8, -1: 6, -2: 32 bytes}, with at most a key id (2). Refuses
 * every other structure or encoding.
 */
export function readCoseKey(bytes: Uint8Array): CoseKey {
  const key = mapOf(
    decodeCbor(bytes),
    [LABEL.keyType, LABEL.keyAlgorithm, OKP_LABEL.curve, OKP_LABEL.x],
    [LABEL.keyType, LABEL.keyKeyId, LABEL.keyAlgorithm, OKP_LABEL.curve, OKP_LABEL.x],
  );
  if (
    key.get(LABEL.keyType) !== OKP ||
    key.get(LABEL.keyAlgorithm) !== EDDSA ||
    key.get(OKP_LABEL.curve) !== ED25519
  )
    refuse();
  return {
    publicKey: bytesOf(key.get(OKP_LABEL.x), PUBLIC_KEY_BYTES),
    keyId: keyIdOf(key.get(LABEL.keyKeyId)),
  };
}

/** Whether two byte strings are equal. */
export function sameBytes(first: Uint8Array, second: Uint8Array): boolean {
  return first.length === second.length && first.every((byte, at) => byte === second[at]);
}

/**
 * Whether `sign1` signs `message` by `publicKey` under RFC 8032's strict rule: its payload is the
 * message (or its BLAKE2b-224 when hashed), or detached, and its signature covers the Sig_structure
 * of the protected header as received and that payload.
 */
export function verifyCoseSign1(
  sign1: CoseSign1,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  const signed = sign1.hashed ? blake2b(message, { dkLen: HASHED_PAYLOAD_BYTES }) : message;
  if (sign1.payload !== null && !sameBytes(sign1.payload, signed)) return false;
  return ed25519.verify(
    sign1.signature,
    sigStructure(sign1.protectedBytes, signed),
    publicKey,
    STRICT,
  );
}
