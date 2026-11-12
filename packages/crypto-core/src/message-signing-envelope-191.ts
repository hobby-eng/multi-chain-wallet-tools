// The message envelope of EIP-191's version 0x45 ("personal_sign") and of TronWeb's
// signMessageV2 (TIP-191): 0x19, "<name> Signed Message:\n", the message's length in bytes written
// in decimal, then the message itself, hashed with Keccak-256. geth accounts.TextAndHash and
// TronWeb src/utils/message.ts hashMessage write exactly these bytes.
import { keccak_256 } from "@noble/hashes/sha3.js";
import { concatBytes } from "./crypto.js";

/** The chains whose wallets sign messages in this envelope. */
export type Envelope191Name = "Ethereum" | "TRON";

/** EIP-191's version byte, which keeps a signed message from ever being an RLP transaction. */
const VERSION = 0x19;

/** The bytes signed for `message` under `name`: its length counts bytes, not characters. */
export function envelope191(name: Envelope191Name, message: Uint8Array): Uint8Array {
  const encoder = new TextEncoder();
  return concatBytes(
    Uint8Array.of(VERSION),
    encoder.encode(`${name} Signed Message:\n${message.length}`),
    message,
  );
}

/** The Keccak-256 digest that a wallet signs for `message` under `name`. */
export function envelope191Digest(name: Envelope191Name, message: Uint8Array): Uint8Array {
  return keccak_256(envelope191(name, message));
}
