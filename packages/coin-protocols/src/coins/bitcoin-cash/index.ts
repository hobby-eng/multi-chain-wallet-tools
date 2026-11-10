import { CASHADDR_P2KH, encodeCashAddr } from "@ckd/core/cashaddr.js";
import { hexToBytes } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { paymentAddressField } from "@ckd/core/types.js";
import { bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { p2pkhAddress, utxoAddressDetails } from "../../utxo-address.js";
import { BITCOIN_CASH_ADDRESS, BITCOIN_CASH_PROFILES } from "./profiles.js";

/** Bitcoin Cash's key and address encodings: CashAddr, and the legacy form wallets still accept. */
export const BITCOIN_CASH_KEYS: Bip44CoinKeys = {
  networkLabel: "Bitcoin Cash mainnet",
  versions: BIP32_MAINNET_VERSIONS,
  wif: BITCOIN_CASH_ADDRESS.wif,
  notices: [
    "Bitcoin Cash addresses are shown in CashAddr form; Advanced mode also shows the legacy form of the same key hash, which Bitcoin Cash wallets still accept.",
  ],
  address: (publicKey) => {
    const legacy = p2pkhAddress(publicKey, BITCOIN_CASH_ADDRESS);
    const hash = hexToBytes(legacy.publicKeyHashHex);
    return {
      address: encodeCashAddr(BITCOIN_CASH_ADDRESS.prefix, CASHADDR_P2KH, hash),
      details: [
        paymentAddressField("legacyAddress", "Legacy address (base58)", legacy.address),
        ...utxoAddressDetails(legacy),
      ],
    };
  },
};

/** The derivation of a Bitcoin Cash adapter id; undefined for another coin's. */
export function bitcoinCashDerivation(id: string) {
  return bip44CoinDerivation(BITCOIN_CASH_PROFILES, () => BITCOIN_CASH_KEYS, id);
}
