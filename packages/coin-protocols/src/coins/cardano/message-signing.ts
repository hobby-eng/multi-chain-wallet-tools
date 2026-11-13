// Cardano's message signing: CIP-30's signData (cardano-foundation/CIPs @7720fed CIP-0030/README.md
// L354-368), the DataSignature that Eternl, Lace, Yoroi and the other CIP-30 wallets return, a
// COSE_Sign1 of CIP-8 (CIP-0008/README.md) and the COSE_Key of the key that signed. A base or
// enterprise address signs with its payment key, a reward address with its stake key: each row
// signs with its own key, kL ‖ kR of its signingKey field. The message is signed as UTF-8 text in
// the COSE_Sign1, not hashed. Verification takes the public key from the row and accepts it only
// when its hash is the address's own; a pasted COSE_Key must name that same key and never stands in
// for it. A pasted structure is read strictly and refused, never guessed at.
import { bytesToHex, hexToBytes, wipe } from "@ckd/core/crypto.js";
import type { DerivedKeySource } from "@ckd/core/derived-private-key.js";
import type { MessageSignature } from "@ckd/core/message-signature.js";
import { DerivationSecretsError } from "@ckd/core/secrets.js";
import { SigningMessage } from "@ckd/core/signing-message.js";
import { Bip32Ed25519Signer } from "../../bip32-ed25519.js";
import {
  formatsOnEveryRow,
  ownFormat,
  type CoinMessageSigning,
  type MessageSigningRequest,
} from "../message-signing.js";
import { cardanoKeyHash, cardanoSigningAddress } from "./address.js";
import { isCborError } from "./message-signing-cbor.js";
import { CARDANO_ROW_PUBLIC_KEY_INPUT } from "./message-signing-inputs.js";
import {
  coseKey,
  coseSign1,
  type CoseKey,
  type CoseSign1,
  isCoseError,
  protectedHeader,
  readCoseKey,
  readCoseSign1,
  sameBytes,
  sigStructure,
  verifyCoseSign1,
} from "./message-signing-cose.js";
import { CARDANO_PROFILES } from "./profiles.js";

const FORMAT_NAME = "CIP-30 signData (CIP-8 COSE_Sign1)";
const FORMATS = Object.freeze({ "cardano-cip30": FORMAT_NAME });

const REFUSALS = {
  INVALID_KEY: "Message signing requires a Cardano extended signing key.",
  INVALID_SIGNATURE:
    "The signature is not CIP-30's DataSignature or a COSE_Sign1 of CIP-8 in deterministic CBOR.",
  SIGNING_FAILED: "The generated signature did not verify against the selected address.",
} as const;

/** The refusal of a key that cannot sign, of an unreadable signature, or of a failed self-check. */
export class CardanoMessageSigningError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS, options?: ErrorOptions) {
    super(REFUSALS[code], options);
    this.name = "CardanoMessageSigningError";
    this.code = code;
  }
}

/** A row's signingKey: kL ‖ kR ‖ public key ‖ chain code, as cardano-cli's extended .skey holds it. */
const SIGNING_KEY_HEX = /^[0-9a-f]{256}$/u;
const EXTENDED_KEY_BYTES = 64;
const PUBLIC_KEY_BYTES = 32;
/** A public key in hex, as the row's publicKeyHex field writes it. */
const PUBLIC_KEY_HEX = /^[0-9a-f]{64}$/u;
/**
 * CIP-30's DataSignature, its two members in either order, each in hex; nothing else, and between
 * them only JSON's own whitespace (RFC 8259), not other spaces.
 */
const DATA_SIGNATURE =
  /^\{[ \t\n\r]*"(signature|key)"[ \t\n\r]*:[ \t\n\r]*"([0-9a-fA-F]*)"[ \t\n\r]*,[ \t\n\r]*"(signature|key)"[ \t\n\r]*:[ \t\n\r]*"([0-9a-fA-F]*)"[ \t\n\r]*\}$/u;
/** JSON's whitespace around a pasted signature, which is dropped; other spaces are not. */
const OUTER_WHITESPACE = /^[ \t\n\r]+|[ \t\n\r]+$/gu;
const HEX_BYTES = /^(?:[0-9a-fA-F]{2})+$/u;

/**
 * The key a row signs with: kL ‖ kR of its signingKey, refused unless it passes the Rust crate's
 * checks (Bip32Ed25519Signer) and its public key is the one the field holds after it.
 */
const SIGNING_KEY: DerivedKeySource = Object.freeze({
  field: "signingKey",
  read: (text: string) => {
    if (!SIGNING_KEY_HEX.test(text)) throw new DerivationSecretsError("derivation.key.material");
    const bytes = hexToBytes(text);
    const extended = bytes.slice(0, EXTENDED_KEY_BYTES);
    let signer: Bip32Ed25519Signer | undefined;
    try {
      signer = Bip32Ed25519Signer.fromExtendedKey(extended);
      const stored = bytes.subarray(EXTENDED_KEY_BYTES, EXTENDED_KEY_BYTES + PUBLIC_KEY_BYTES);
      if (!sameBytes(signer.publicKey(), stored)) throw new Error("another public key");
      return extended;
    } catch {
      wipe(extended);
      throw new DerivationSecretsError("derivation.key.material");
    } finally {
      signer?.wipe();
      wipe(bytes);
    }
  },
});

function unreadable(cause?: unknown): never {
  throw new CardanoMessageSigningError("INVALID_SIGNATURE", { cause });
}

function hexBytes(text: string | undefined): Uint8Array {
  if (text === undefined || !HEX_BYTES.test(text)) unreadable();
  return hexToBytes(text.toLowerCase());
}

/** The COSE_Sign1 and, from a DataSignature, the COSE_Key of a pasted signature, as bytes. */
function readDataSignature(text: string): { sign1: Uint8Array; key: Uint8Array | undefined } {
  const trimmed = text.replace(OUTER_WHITESPACE, "");
  if (!trimmed.startsWith("{")) return { sign1: hexBytes(trimmed), key: undefined };
  const members = DATA_SIGNATURE.exec(trimmed);
  if (members === null || members[1] === members[3]) unreadable();
  const byName = new Map([
    [members[1], members[2]],
    [members[3], members[4]],
  ]);
  return { sign1: hexBytes(byName.get("signature")), key: hexBytes(byName.get("key")) };
}

/** The row's public key that the request carries, or undefined. */
function rowPublicKey(request: MessageSigningRequest): Uint8Array | undefined {
  const text = request.inputs?.[CARDANO_ROW_PUBLIC_KEY_INPUT];
  return text !== undefined && PUBLIC_KEY_HEX.test(text) ? hexToBytes(text) : undefined;
}

/** A pasted signature read strictly: its COSE_Sign1 and its COSE_Key, if any. */
interface PastedSignature {
  readonly sign1: CoseSign1;
  readonly key: CoseKey | undefined;
}

/** The pasted `text`, refused (INVALID_SIGNATURE) unless every structure in it is CIP-8's. */
function readSignature(text: string): PastedSignature {
  const pasted = readDataSignature(text);
  let signature: PastedSignature;
  try {
    signature = {
      sign1: readCoseSign1(pasted.sign1),
      key: pasted.key === undefined ? undefined : readCoseKey(pasted.key),
    };
  } catch (cause) {
    if (isCborError(cause) || isCoseError(cause)) unreadable(cause);
    throw cause;
  }
  // CIP-30: a key id in both structures must be the same.
  const ids = [signature.sign1.keyId, signature.key?.keyId];
  if (ids[0] !== undefined && ids[1] !== undefined && !sameBytes(ids[0], ids[1])) unreadable();
  return signature;
}

/**
 * Whether `signature` signs the request's message for its address by `publicKey`, whose hash must
 * be the address's signing credential, and whose key a pasted COSE_Key must name.
 */
function verifies(
  request: MessageSigningRequest,
  signature: PastedSignature,
  publicKey: Uint8Array,
): boolean {
  const target = cardanoSigningAddress(request.address);
  if (
    target === undefined ||
    (signature.key !== undefined && !sameBytes(signature.key.publicKey, publicKey)) ||
    !sameBytes(signature.sign1.address, target.bytes) ||
    !sameBytes(cardanoKeyHash(publicKey), target.signer)
  )
    return false;
  return verifyCoseSign1(signature.sign1, new TextEncoder().encode(request.message), publicKey);
}

/** Signs with the borrowed kL ‖ kR, which the caller wipes; the result is checked as it is read. */
function sign(privateKey: Uint8Array, request: MessageSigningRequest): MessageSignature {
  ownFormat(FORMATS, request.format);
  SigningMessage.require(request.message);
  let signer: Bip32Ed25519Signer;
  try {
    signer = Bip32Ed25519Signer.fromExtendedKey(privateKey);
  } catch (cause) {
    throw new CardanoMessageSigningError("INVALID_KEY", { cause });
  }
  try {
    const publicKey = signer.publicKey();
    const target = cardanoSigningAddress(request.address);
    if (target === undefined || !sameBytes(cardanoKeyHash(publicKey), target.signer))
      throw new CardanoMessageSigningError("SIGNING_FAILED");
    const payload = new TextEncoder().encode(request.message);
    const header = protectedHeader(target.bytes);
    const signature = signer.sign(sigStructure(header, payload));
    const text = JSON.stringify({
      signature: bytesToHex(coseSign1(header, payload, signature)),
      key: bytesToHex(coseKey(publicKey)),
    });
    if (!verifies(request, readSignature(text), publicKey))
      throw new CardanoMessageSigningError("SIGNING_FAILED");
    return { signature: text, format: FORMAT_NAME, verified: true };
  } finally {
    signer.wipe();
  }
}

/** Cardano's one format, for each of its variants' rows and each address a row offers. */
export const CARDANO_MESSAGE_SIGNING: CoinMessageSigning = Object.freeze({
  formats: formatsOnEveryRow(
    FORMATS,
    CARDANO_PROFILES.map((profile) => profile.adapterId),
  ),
  key: SIGNING_KEY,
  sign,
  verify: (request: MessageSigningRequest, text: string) => {
    ownFormat(FORMATS, request.format);
    // Read before the key is looked at, so that a malformed signature is refused whatever the row.
    const signature = readSignature(text);
    const publicKey = rowPublicKey(request);
    return publicKey === undefined ? false : verifies(request, signature, publicKey);
  },
});
