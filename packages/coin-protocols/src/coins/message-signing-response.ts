// The signature of a pasted wallet response, shared by the coins whose wallets return a response
// object or a bare Base64 signature: Stellar, NEAR, TON, Cosmos, Injective and Hedera. Only the
// signature is read; the dialog's message, inputs and row are what a signature is checked against.
import { base64 } from "@scure/base";

/** A signature in standard Base64 with its padding, as SEP-53 and most wallets write it. */
export function base64Signature(text: string): Uint8Array | undefined {
  const trimmed = text.trim();
  if (!/^[A-Za-z0-9+/]{86}==$/u.test(trimmed)) return undefined;
  return base64.decode(trimmed);
}

/**
 * The signature of a pasted wallet response, a JSON object whose `signature` member is Base64, or
 * of the bare Base64 signature. The response's other members are not read: the dialog's message,
 * inputs and row are what a signature is checked against.
 */
export function responseSignature(text: string): Uint8Array | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return base64Signature(trimmed);
  let response: unknown;
  try {
    response = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  const signature =
    typeof response === "object" && response !== null && Object.hasOwn(response, "signature")
      ? (response as { signature: unknown }).signature
      : undefined;
  return typeof signature === "string" ? base64Signature(signature) : undefined;
}
