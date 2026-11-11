import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { bip44CoinAddresses, bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { evmAddressOfKey } from "../keccak-account.js";
import { ETHEREUM_CLASSIC_LEDGER_LEGACY, ETHEREUM_CLASSIC_PROFILES } from "./profiles.js";

/** Ethereum Classic's key and address encodings. */
export const ETHEREUM_CLASSIC_KEYS: Bip44CoinKeys = {
  networkLabel: "Ethereum Classic mainnet (chain ID 61)",
  versions: BIP32_MAINNET_VERSIONS,
  uncompressedPublicKey: true,
  notices: [
    "Ethereum Classic uses Ethereum's address form (EIP-55). Wallets that keep it at Ethereum's coin type 60 show the Ethereum addresses of the same phrase.",
  ],
  address: (publicKey) => ({
    address: evmAddressOfKey(publicKey),
  }),
};

/** The derivation of the Ethereum Classic adapter id; undefined for another coin's. */
export function ethereumClassicDerivation(id: string) {
  return bip44CoinDerivation(ETHEREUM_CLASSIC_PROFILES, () => ETHEREUM_CLASSIC_KEYS, id);
}

/**
 * Ethereum Classic's public 0x addresses for the connected tools, as its own wallets lay them out:
 * the BIP44 address index and Ledger Live's account index at its coin type 61 (the Deriver's row and
 * Ledger Live's account form), then Ledger's legacy Ethereum Classic path.
 */
export const ETHEREUM_CLASSIC_ADDRESSES = bip44CoinAddresses(
  ETHEREUM_CLASSIC_PROFILES,
  ETHEREUM_CLASSIC_KEYS,
  { fixedPaths: [ETHEREUM_CLASSIC_LEDGER_LEGACY] },
);
