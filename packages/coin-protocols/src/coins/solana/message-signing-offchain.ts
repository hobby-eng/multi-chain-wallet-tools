// Solana's off-chain message, version 0, as solana-sdk's offchain-message crate serializes it and
// the Solana CLI's sign-offchain-message signs it (lib.rs L40-L238 at 617887a6, read 2026-11-11):
// the signing domain "\xffsolana offchain", the version 0, a format that the message's content
// chooses, the message's length as u16 little-endian, and the message. The whole is signed, not
// its hash. The newer version 1 (Anza's proposal) is a different layout and is not written here.
import { concatBytes } from "@ckd/core/crypto.js";

/** The prefix no transaction can start with. */
const SIGNING_DOMAIN = Uint8Array.of(0xff, ...new TextEncoder().encode("solana offchain"));
const VERSION = 0;
/** The longest message a Ledger signs (MAX_LEN_LEDGER), formats 0 and 1. */
const LEDGER_LIMIT = 1212;
/** The longest version 0 message (MAX_LEN), format 2. */
const LIMIT = 65515;
const RESTRICTED_ASCII = 0;
const LIMITED_UTF8 = 1;
const EXTENDED_UTF8 = 2;

const REFUSALS = {
  EMPTY_MESSAGE: "Solana's off-chain message cannot be empty.",
  MESSAGE_TOO_LONG: `Solana's off-chain message holds at most ${LIMIT} bytes.`,
} as const;

/** The refusal of a message that version 0 cannot hold. */
export class SolanaOffchainMessageError extends Error {
  readonly code: keyof typeof REFUSALS;

  constructor(code: keyof typeof REFUSALS) {
    super(REFUSALS[code]);
    this.name = "SolanaOffchainMessageError";
    this.code = code;
  }
}

/** Whether every byte is printable ASCII, 0x20 to 0x7E, as `is_printable_ascii` reads it. */
function printableAscii(message: Uint8Array): boolean {
  return message.every((byte) => byte >= 0x20 && byte <= 0x7e);
}

/** Refuses the length of a UTF-8 message that version 0 cannot hold; the page checks it early. */
export function admitSolanaOffchainLength(length: number): void {
  if (length === 0) throw new SolanaOffchainMessageError("EMPTY_MESSAGE");
  if (length > LIMIT) throw new SolanaOffchainMessageError("MESSAGE_TOO_LONG");
}

/** The signed bytes of the UTF-8 `message`, in the format `v0::OffchainMessage::new` chooses. */
export function solanaOffchainMessage(message: Uint8Array): Uint8Array {
  admitSolanaOffchainLength(message.length);
  const format =
    message.length > LEDGER_LIMIT
      ? EXTENDED_UTF8
      : printableAscii(message)
        ? RESTRICTED_ASCII
        : LIMITED_UTF8;
  const header = Uint8Array.of(VERSION, format, message.length & 0xff, message.length >> 8);
  return concatBytes(SIGNING_DOMAIN, header, message);
}
