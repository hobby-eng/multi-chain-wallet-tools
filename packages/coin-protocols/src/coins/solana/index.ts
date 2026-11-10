import { base58 } from "@scure/base";
import { bytesToHex, concatBytes, wipe } from "@ckd/core/crypto.js";
import { field, paymentAddressField } from "@ckd/core/types.js";
import { ed25519CoinDerivation, type Ed25519CoinKeys } from "../ed25519-coin.js";
import { SOLANA_PROFILES } from "./profiles.js";

/** Solana's key forms: the address is the base58 public key; wallets import base58 of seed ‖ key. */
export const SOLANA_KEYS: Ed25519CoinKeys = {
  networkLabel: "Solana mainnet",
  fields: (privateKey, publicKey) => {
    const keypair = concatBytes(privateKey, publicKey);
    try {
      return {
        basic: [
          paymentAddressField("address", "Address", base58.encode(publicKey), "solana"),
          field(
            "privateKey",
            "Private key (base58 keypair, as Phantom imports it)",
            base58.encode(keypair),
            true,
          ),
        ],
        advanced: [
          field("publicKey", "Public key (hex)", bytesToHex(publicKey)),
          field("privateKeyHex", "Ed25519 seed (32-byte hex)", bytesToHex(privateKey), true),
        ],
      };
    } finally {
      wipe(keypair);
    }
  },
};

/** The derivation of a Solana adapter id; undefined for another coin's. */
export function solanaDerivation(id: string) {
  return ed25519CoinDerivation(SOLANA_PROFILES, SOLANA_KEYS, id);
}
