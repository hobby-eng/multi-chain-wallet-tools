import { bytesToHex } from "@ckd/core/crypto.js";
import { field, paymentAddressField } from "@ckd/core/types.js";
import { ed25519CoinDerivation, type Ed25519CoinKeys } from "../ed25519-coin.js";
import { STELLAR_PROFILES } from "./profiles.js";
import { strKey, STRKEY_PUBLIC_KEY, STRKEY_SECRET_SEED } from "./strkey.js";

/** Stellar's key forms: the account ID (G…) and the secret seed (S…) wallets import. */
export const STELLAR_KEYS: Ed25519CoinKeys = {
  networkLabel: "Stellar mainnet",
  notices: ["A Stellar account exists only after it receives the base reserve in XLM."],
  fields: (privateKey, publicKey) => ({
    basic: [
      paymentAddressField("address", "Account ID", strKey(STRKEY_PUBLIC_KEY, publicKey)),
      field("privateKey", "Secret seed", strKey(STRKEY_SECRET_SEED, privateKey), true),
    ],
    advanced: [field("publicKey", "Public key (hex)", bytesToHex(publicKey))],
  }),
};

/** The derivation of the Stellar adapter id; undefined for another coin's. */
export function stellarDerivation(id: string) {
  return ed25519CoinDerivation(STELLAR_PROFILES, STELLAR_KEYS, id);
}
