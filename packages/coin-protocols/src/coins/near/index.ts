import { bytesToHex, concatBytes, wipe } from "@ckd/core/crypto.js";
import { field, paymentAddressField } from "@ckd/core/types.js";
import {
  ed25519CoinAddresses,
  ed25519CoinDerivation,
  type Ed25519CoinKeys,
} from "../ed25519-coin.js";
import { nearImplicitAccount, nearKeyText } from "./account.js";
import { NEAR_PROFILES } from "./profiles.js";

/** NEAR's key forms, as near-seed-phrase writes them: "ed25519:" and base58. */
export const NEAR_KEYS: Ed25519CoinKeys = {
  networkLabel: "NEAR mainnet",
  notices: [
    "The address is the key's implicit account (its public key in hex). A named account such as name.near is a separate account that may hold this key; only the network knows that.",
  ],
  fields: (privateKey, publicKey) => {
    const keypair = concatBytes(privateKey, publicKey);
    try {
      return {
        basic: [
          paymentAddressField("address", "Implicit account", nearImplicitAccount(publicKey)),
          field("publicKey", "Public key", nearKeyText(publicKey)),
          field("privateKey", "Secret key", nearKeyText(keypair), true),
        ],
        advanced: [
          field("privateKeyHex", "Ed25519 seed (32-byte hex)", bytesToHex(privateKey), true),
        ],
      };
    } finally {
      wipe(keypair);
    }
  },
};

/** The derivation of the NEAR adapter id; undefined for another coin's. */
export function nearDerivation(id: string) {
  return ed25519CoinDerivation(NEAR_PROFILES, NEAR_KEYS, id);
}

/** NEAR's public implicit accounts for the connected tools, as the rows show them. */
export const NEAR_ADDRESSES = ed25519CoinAddresses(NEAR_PROFILES, nearImplicitAccount);
