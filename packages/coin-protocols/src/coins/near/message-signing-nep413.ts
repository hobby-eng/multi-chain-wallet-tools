// NEAR's NEP-413 signMessage (Final, nep-0413.md at 095fe982, read 2026-11-11): Ed25519 over
// SHA-256 of the NEP-461 prefix tag 2^31 + 413 (u32, little-endian) and the Borsh form of the
// payload {message, nonce[32], recipient, callbackUrl?}. A Borsh string is its UTF-8 length as a u32
// and its bytes; an absent callback URL is the byte 0, a present one 1 and the string.
import { base64, hex } from "@scure/base";
import { concatBytes, sha256 } from "@ckd/core/crypto.js";
import { utf8Text } from "@ckd/core/signing-message.js";

/** The NEP-461 prefix tag of NEP-413 messages. */
const TAG = 2 ** 31 + 413;
/** The longest recipient admitted, such as an app's domain or an account. */
const RECIPIENT_LIMIT = 256;
/** The longest callback URL admitted. */
const CALLBACK_LIMIT = 2048;

/** The keys of NEP-413's inputs in a request (MessageSigningRequest.inputs). */
export const NEP413_INPUTS = Object.freeze({
  recipient: "recipient",
  nonce: "nonce",
  callbackUrl: "callbackUrl",
});

const REFUSALS = {
  RECIPIENT_REQUIRED: "Enter the recipient the message is for, such as the app's domain.",
  INVALID_RECIPIENT: `The recipient must be text of at most ${RECIPIENT_LIMIT} UTF-8 bytes.`,
  INVALID_NONCE: "The nonce must be 32 bytes: 64 hex digits, or 44 Base64 characters.",
  INVALID_CALLBACK: `The callback URL must be text of at most ${CALLBACK_LIMIT} UTF-8 bytes.`,
} as const;

/** The refusal of an input of NEP-413's payload; it never repeats the input. */
export class Nep413InputError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "Nep413InputError";
    this.code = code;
  }
}

/** The 32 bytes of a nonce written as 64 hex digits or as Base64; the lengths cannot collide. */
function nonceBytes(text: string | undefined): Uint8Array {
  if (text !== undefined && /^[0-9a-fA-F]{64}$/u.test(text)) return hex.decode(text.toLowerCase());
  if (text !== undefined && /^[A-Za-z0-9+/]{43}=$/u.test(text)) return base64.decode(text);
  throw new Nep413InputError("INVALID_NONCE");
}

/** Borsh's string: its UTF-8 length as a u32, little-endian, and its bytes. */
function borshString(bytes: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, bytes.length, true);
  return concatBytes(length, bytes);
}

/** The payload's parts after the message, each admitted: nonce, recipient and callback. */
function payloadTail(inputs: Readonly<Record<string, string>> | undefined): Uint8Array[] {
  const recipientText = inputs?.[NEP413_INPUTS.recipient];
  if (recipientText === undefined || recipientText === "")
    throw new Nep413InputError("RECIPIENT_REQUIRED");
  const recipient = utf8Text(recipientText, RECIPIENT_LIMIT);
  if (recipient === undefined) throw new Nep413InputError("INVALID_RECIPIENT");
  const nonce = nonceBytes(inputs?.[NEP413_INPUTS.nonce]);
  const callbackText = inputs?.[NEP413_INPUTS.callbackUrl] ?? "";
  const callback = utf8Text(callbackText, CALLBACK_LIMIT);
  if (callback === undefined) throw new Nep413InputError("INVALID_CALLBACK");
  const option =
    callbackText === "" ? Uint8Array.of(0) : concatBytes(Uint8Array.of(1), borshString(callback));
  return [nonce, borshString(recipient), option];
}

/** Refuses NEP-413's inputs before a key is derived; the page checks them early. */
export function admitNep413Inputs(inputs: Readonly<Record<string, string>> | undefined): void {
  payloadTail(inputs);
}

/** The 32 bytes NEP-413 signs for `message` (UTF-8) and the request's inputs. */
export function nep413SignedBytes(
  message: Uint8Array,
  inputs: Readonly<Record<string, string>> | undefined,
): Uint8Array {
  const tag = new Uint8Array(4);
  new DataView(tag.buffer).setUint32(0, TAG, true);
  const payload = concatBytes(tag, borshString(message), ...payloadTail(inputs));
  try {
    return sha256(payload);
  } finally {
    payload.fill(0);
  }
}
