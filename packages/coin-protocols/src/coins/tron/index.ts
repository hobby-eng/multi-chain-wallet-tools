import { bytesToHex, concatBytes, encodeBase58Check } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { field } from "@ckd/core/types.js";
import { bip44CoinAddresses, bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { keccakAccount } from "../keccak-account.js";
import { TRON_ADDRESS_PREFIX, TRON_PROFILES } from "./profiles.js";

/** Tron's key and address encodings. */
export const TRON_KEYS: Bip44CoinKeys = {
  networkLabel: "Tron mainnet",
  versions: BIP32_MAINNET_VERSIONS,
  address: (publicKey) => {
    const payload = concatBytes(Uint8Array.of(TRON_ADDRESS_PREFIX), keccakAccount(publicKey));
    return {
      address: encodeBase58Check(payload),
      details: [field("hexAddress", "Hex address", bytesToHex(payload))],
    };
  },
};

/** The derivation of the Tron adapter id; undefined for another coin's. */
export function tronDerivation(id: string) {
  return bip44CoinDerivation(TRON_PROFILES, () => TRON_KEYS, id);
}

/** Tron's public T… addresses for the connected tools, as the rows show them. */
export const TRON_ADDRESSES = bip44CoinAddresses(TRON_PROFILES, TRON_KEYS);
