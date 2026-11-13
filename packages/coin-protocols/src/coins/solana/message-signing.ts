// Solana's message signing: the wallets' signMessage, Ed25519 over the message's bytes as they are
// (Phantom, Solflare and the Wallet Standard's solana:signMessage), and the off-chain message
// version 0 that the Solana CLI signs and verifies. Both write the signature in Base58, as Solana
// writes signatures; the address is the public key.
import { ed25519HexSeed } from "@ckd/core/derived-private-key.js";
import { base58 } from "@scure/base";
import { base58Signature, ed25519CoinSigning } from "../message-signing-ed25519.js";
import type { MessageSigningRequest } from "../message-signing.js";
import { solanaAddress, solanaPublicKeyOf } from "./address.js";
import { solanaOffchainMessage } from "./message-signing-offchain.js";
import { SOLANA_PROFILES } from "./profiles.js";

const utf8 = (request: MessageSigningRequest) => new TextEncoder().encode(request.message);

/** Solana's two formats, for both of its variants. */
export const SOLANA_MESSAGE_SIGNING = ed25519CoinSigning({
  key: ed25519HexSeed("privateKeyHex"),
  adapters: SOLANA_PROFILES.map((profile) => profile.adapterId),
  formats: {
    "solana-raw": {
      name: "Solana signMessage (raw bytes)",
      signedBytes: utf8,
      write: (signature) => base58.encode(signature),
      read: base58Signature,
    },
    "solana-offchain-v0": {
      name: "Solana off-chain message v0",
      signedBytes: (request) => {
        const message = utf8(request);
        try {
          return solanaOffchainMessage(message);
        } finally {
          message.fill(0);
        }
      },
      write: (signature) => base58.encode(signature),
      read: base58Signature,
    },
  },
  publicKeyOf: (request) => solanaPublicKeyOf(request.address) ?? undefined,
  owns: (publicKey, address) => solanaAddress(publicKey) === address,
});
