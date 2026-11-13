// Hedera's hedera_signMessage (HIP-820, hip-820.md L158-L176 at c57ef839): the message prefixed with
// "\x19Hedera Signed Message:\n" and its length, signed "in the same manner as HAPI transactions":
// Ed25519 over the bytes, ECDSA over their Keccak-256 (the Hiero SDK's ecdsa.js). The reference
// implementation (hedera-wallet-connect's prefixMessageToSign) counts the message's UTF-16 units,
// HIP-1334 its UTF-8 bytes; they agree on ASCII only, so only ASCII text is signed (decision D5).
import { envelope191, envelope191Digest } from "@ckd/core/message-signing-envelope-191.js";

/** ASCII, where every count of the length is the same. */
const ASCII = /^\p{ASCII}*$/u;

const REFUSALS = {
  NOT_ASCII: "Hedera wallets count the length of other text differently; use ASCII text.",
} as const;

/** The refusal of a message that HIP-820 cannot sign unambiguously. */
export class Hip820MessageError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "Hip820MessageError";
    this.code = code;
  }
}

/** Refuses a message that is not ASCII; the page checks it early. */
export function admitHip820Message(message: string): void {
  if (!ASCII.test(message)) throw new Hip820MessageError("NOT_ASCII");
}

/** The bytes an Ed25519 key signs for `message`. */
export function hip820Bytes(message: string): Uint8Array {
  admitHip820Message(message);
  return envelope191("Hedera", new TextEncoder().encode(message));
}

/** The Keccak-256 digest an ECDSA key signs for `message`. */
export function hip820Digest(message: string): Uint8Array {
  admitHip820Message(message);
  return envelope191Digest("Hedera", new TextEncoder().encode(message));
}
