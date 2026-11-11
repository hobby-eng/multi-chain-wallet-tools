import { bech32 } from "@scure/base";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { field } from "@ckd/core/types.js";
import { bip44CoinAddresses, bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { evmAddressOfKey, keccakAccount } from "../keccak-account.js";
import { INJECTIVE_HRP, INJECTIVE_PROFILES } from "./profiles.js";

/** Injective's eth_secp256k1 account: bech32 "inj" of the Keccak account bytes Ethereum uses. */
export const INJECTIVE_KEYS: Bip44CoinKeys = {
  networkLabel: "Injective mainnet",
  versions: BIP32_MAINNET_VERSIONS,
  notices: [
    "Injective uses Ethereum's coin type and account bytes: the same key also controls the 0x address shown in Advanced mode.",
  ],
  address: (publicKey) => {
    const accountBytes = keccakAccount(publicKey);
    return {
      address: bech32.encode(INJECTIVE_HRP, bech32.toWords(accountBytes)),
      details: [field("evmAddress", "EVM address (EIP-55)", evmAddressOfKey(publicKey))],
    };
  },
};

/** The derivation of the Injective adapter id; undefined for another coin's. */
export function injectiveDerivation(id: string) {
  return bip44CoinDerivation(INJECTIVE_PROFILES, () => INJECTIVE_KEYS, id);
}

/**
 * Injective's public inj1… addresses for the connected tools, as the rows show them: the address
 * index and Ledger Live's account index m/44'/60'/i'/0/0.
 */
export const INJECTIVE_ADDRESSES = bip44CoinAddresses(INJECTIVE_PROFILES, INJECTIVE_KEYS);
