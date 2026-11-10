import { bytesToHex, hash160 } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { field } from "@ckd/core/types.js";
import { bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { xrpClassicAddress } from "./address.js";
import { XRP_PROFILES } from "./profiles.js";

/** XRP's key and address encodings. */
export const XRP_KEYS: Bip44CoinKeys = {
  networkLabel: "XRP Ledger mainnet",
  versions: BIP32_MAINNET_VERSIONS,
  notices: [
    "An XRP Ledger account exists only after it receives the reserve. The secp256k1 private key is shown as hex; a family seed (s…) is a different secret and is not derived here.",
  ],
  address: (publicKey) => {
    const accountId = hash160(publicKey);
    return {
      address: xrpClassicAddress(accountId),
      details: [field("accountId", "Account ID (hex)", bytesToHex(accountId))],
    };
  },
};

/** The derivation of the XRP adapter id; undefined for another coin's. */
export function xrpDerivation(id: string) {
  return bip44CoinDerivation(XRP_PROFILES, () => XRP_KEYS, id);
}
