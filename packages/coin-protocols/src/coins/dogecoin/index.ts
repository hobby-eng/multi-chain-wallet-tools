import { bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { p2pkhAddress, utxoAddressDetails } from "../../utxo-address.js";
import { DOGECOIN_ADDRESS, DOGECOIN_PROFILES } from "./profiles.js";

/** Dogecoin's key and address encodings, its extended keys in dgpv/dgub form. */
export const DOGECOIN_KEYS: Bip44CoinKeys = {
  networkLabel: "Dogecoin mainnet",
  versions: DOGECOIN_ADDRESS.versions,
  wif: DOGECOIN_ADDRESS.wif,
  summaryLabels: {
    masterXprv: "Master dgpv",
    masterXpub: "Master dgub",
    accountXprv: "Account dgpv",
    accountXpub: "Account dgub",
  },
  address: (publicKey) => {
    const details = p2pkhAddress(publicKey, DOGECOIN_ADDRESS);
    return { address: details.address, scheme: "dogecoin", details: utxoAddressDetails(details) };
  },
};

/** The derivation of the Dogecoin adapter id; undefined for another coin's. */
export function dogecoinDerivation(id: string) {
  return bip44CoinDerivation(DOGECOIN_PROFILES, () => DOGECOIN_KEYS, id);
}
