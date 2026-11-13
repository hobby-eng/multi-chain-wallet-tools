// TON Connect's signData for text and binary payloads (spec/rpc.md L317-L471 at 5656a962, read
// 2026-11-11): Ed25519 over SHA-256 of 0xFFFF, "ton-connect/sign-data/", the wallet address
// (workchain i32 and account id), the app's domain (u32 length and UTF-8), the timestamp (u64), and
// "txt" or "bin" with the payload (u32 length and bytes). Every integer is big-endian, as the
// spec and near/intents' verifier read it, unlike ton_proof's little-endian fields. Cell payloads,
// which need TON's cell hashing and TEP-81 domains, and ton_proof are not written here.
import { hex } from "@scure/base";
import { concatBytes, sha256 } from "@ckd/core/crypto.js";
import { SigningMessage, utf8Text } from "@ckd/core/signing-message.js";

/** The prefix of signData's text and binary messages. */
const PREFIX = concatBytes(
  Uint8Array.of(0xff, 0xff),
  new TextEncoder().encode("ton-connect/sign-data/"),
);
/** The rows' workchain, the basechain. */
const BASECHAIN = 0;
/** A DNS name's longest form. */
const DOMAIN_LIMIT = 253;

/** The keys of signData's inputs in a request (MessageSigningRequest.inputs). */
export const TON_SIGN_DATA_INPUTS = Object.freeze({
  domain: "domain",
  timestamp: "timestamp",
  /** The row's public key in hex, which verification needs: a TON address is a contract's. */
  publicKey: "publicKey",
});

/** The payload kinds this module writes, with their prefixes. */
export type TonSignDataKind = "text" | "binary";
const KIND_PREFIX: Readonly<Record<TonSignDataKind, Uint8Array>> = Object.freeze({
  text: new TextEncoder().encode("txt"),
  binary: new TextEncoder().encode("bin"),
});

/** The longest binary payload: the message box holds two hex digits per byte. */
export const TON_BINARY_LIMIT = SigningMessage.maxBytes / 2;

const REFUSALS = {
  DOMAIN_REQUIRED: "Enter the domain of the app that asks for the signature, such as app.example.",
  INVALID_DOMAIN: `The domain must be at most ${DOMAIN_LIMIT} printable ASCII characters, without spaces.`,
  INVALID_TIMESTAMP: `The timestamp must be whole seconds since 1970, at most ${Number.MAX_SAFE_INTEGER}.`,
  INVALID_BYTES: "Enter the bytes as hex digits, two per byte.",
} as const;

/** The refusal of an input or a binary payload of signData; it never repeats the input. */
export class TonSignDataError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "TonSignDataError";
    this.code = code;
  }
}

/** The domain's bytes: an app's DNS name or host, printable ASCII without spaces. */
function domainBytes(text: string | undefined): Uint8Array {
  if (text === undefined || text === "") throw new TonSignDataError("DOMAIN_REQUIRED");
  const bytes = /^[\x21-\x7e]+$/u.test(text) ? utf8Text(text, DOMAIN_LIMIT) : undefined;
  if (bytes === undefined) throw new TonSignDataError("INVALID_DOMAIN");
  return bytes;
}

/** The timestamp in whole seconds, decimal digits up to the largest exact JavaScript integer. */
export function tonSignDataTimestamp(text: string | undefined): number {
  const seconds = text !== undefined && /^(?:0|[1-9]\d{0,15})$/u.test(text) ? Number(text) : NaN;
  if (!Number.isSafeInteger(seconds)) throw new TonSignDataError("INVALID_TIMESTAMP");
  return seconds;
}

/** The payload's bytes: the message's UTF-8, or the bytes its hex digits write. */
export function tonSignDataPayload(message: string, kind: TonSignDataKind): Uint8Array {
  if (kind === "text") return new TextEncoder().encode(message);
  if (!/^(?:[0-9a-fA-F]{2})*$/u.test(message)) throw new TonSignDataError("INVALID_BYTES");
  return hex.decode(message.toLowerCase());
}

/** Refuses signData's domain, timestamp and binary payload before a key is derived. */
export function admitTonSignData(
  message: string,
  kind: TonSignDataKind,
  inputs: Readonly<Record<string, string>> | undefined,
): void {
  domainBytes(inputs?.[TON_SIGN_DATA_INPUTS.domain]);
  tonSignDataTimestamp(inputs?.[TON_SIGN_DATA_INPUTS.timestamp]);
  tonSignDataPayload(message, kind);
}

/** A u32 or i32, big-endian. */
function u32be(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, false);
  return bytes;
}

/** The 32 bytes signData signs for the basechain account `accountId`, the message and inputs. */
export function tonSignDataSignedBytes(
  accountId: Uint8Array,
  message: string,
  kind: TonSignDataKind,
  inputs: Readonly<Record<string, string>> | undefined,
): Uint8Array {
  const domain = domainBytes(inputs?.[TON_SIGN_DATA_INPUTS.domain]);
  const timestamp = new Uint8Array(8);
  new DataView(timestamp.buffer).setBigUint64(
    0,
    BigInt(tonSignDataTimestamp(inputs?.[TON_SIGN_DATA_INPUTS.timestamp])),
    false,
  );
  const payload = tonSignDataPayload(message, kind);
  const signed = concatBytes(
    PREFIX,
    u32be(BASECHAIN),
    accountId,
    u32be(domain.length),
    domain,
    timestamp,
    KIND_PREFIX[kind],
    u32be(payload.length),
    payload,
  );
  try {
    return sha256(signed);
  } finally {
    signed.fill(0);
    payload.fill(0);
  }
}
