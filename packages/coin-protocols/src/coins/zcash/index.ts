import { concatBytes, encodeBase58Check, hash160 } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { p2pkhScript, utxoAddressDetails } from "../../utxo-address.js";
import { ZCASH_ADDRESS, ZCASH_PROFILES } from "./profiles.js";

/** Zcash's key and address encodings: transparent P2PKH under its two-byte version. */
export const ZCASH_KEYS: Bip44CoinKeys = {
  networkLabel: "Zcash mainnet",
  versions: BIP32_MAINNET_VERSIONS,
  wif: ZCASH_ADDRESS.wif,
  notices: [
    "These are Zcash's transparent addresses, public like Bitcoin's. Shielded Sapling and Orchard addresses are not derived here.",
  ],
  address: (publicKey) => {
    const publicKeyHash = hash160(publicKey);
    return {
      address: encodeBase58Check(concatBytes(Uint8Array.from(ZCASH_ADDRESS.t1), publicKeyHash)),
      scheme: "zcash",
      details: utxoAddressDetails(p2pkhScript(publicKeyHash)),
    };
  },
};

/** The derivation of the Zcash adapter id; undefined for another coin's. */
export function zcashDerivation(id: string) {
  return bip44CoinDerivation(ZCASH_PROFILES, () => ZCASH_KEYS, id);
}
