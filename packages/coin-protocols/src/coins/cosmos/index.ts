import { bech32 } from "@scure/base";
import { bytesToHex, hash160 } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { field } from "@ckd/core/types.js";
import { bip44CoinAddresses, bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { COSMOS_HRP, COSMOS_PROFILES } from "./profiles.js";

/** The Cosmos SDK's secp256k1 account: bech32 "cosmos" of HASH160 of the compressed key. */
export const COSMOS_KEYS: Bip44CoinKeys = {
  networkLabel: "Cosmos Hub mainnet",
  versions: BIP32_MAINNET_VERSIONS,
  address: (publicKey) => {
    const accountBytes = hash160(publicKey);
    return {
      address: bech32.encode(COSMOS_HRP, bech32.toWords(accountBytes)),
      details: [field("accountBytes", "Account bytes (hex)", bytesToHex(accountBytes))],
    };
  },
};

/** The derivation of the Cosmos adapter id; undefined for another coin's. */
export function cosmosDerivation(id: string) {
  return bip44CoinDerivation(COSMOS_PROFILES, () => COSMOS_KEYS, id);
}

/**
 * Cosmos's public cosmos1… addresses for the connected tools, as the rows show them: Keplr's address
 * index and Ledger Live's account index m/44'/118'/i'/0/0.
 */
export const COSMOS_ADDRESSES = bip44CoinAddresses(COSMOS_PROFILES, COSMOS_KEYS);
