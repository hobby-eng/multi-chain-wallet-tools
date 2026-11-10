import { encodeP2sh, hexToBytes } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import { paymentAddressField } from "@ckd/core/types.js";
import { bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import type { Bip44CoinProfile } from "../bip44-coin-profile.js";
import {
  p2pkhAddress,
  p2shP2wpkhAddress,
  p2wpkhAddress,
  utxoAddressDetails,
} from "../../utxo-address.js";
import { LITECOIN_ADDRESS, LITECOIN_PROFILES } from "./profiles.js";

/** The key and address encodings of one Litecoin profile. */
export function litecoinKeys(profile: Bip44CoinProfile): Bip44CoinKeys {
  const keys = {
    networkLabel: "Litecoin mainnet",
    versions: BIP32_MAINNET_VERSIONS,
    wif: LITECOIN_ADDRESS.wif,
  };
  if (profile.purpose === 49)
    return {
      ...keys,
      address: (publicKey) => {
        const details = p2shP2wpkhAddress(publicKey, LITECOIN_ADDRESS);
        // The same script hash under the old version 5, which early wallets showed ("3…").
        const oldForm = encodeP2sh(hexToBytes(details.scriptHashHex), LITECOIN_ADDRESS.oldP2sh);
        return {
          address: details.address,
          scheme: "litecoin",
          details: [
            paymentAddressField("oldP2shAddress", "Same address in the old 3… form", oldForm),
            ...utxoAddressDetails(details),
          ],
        };
      },
    };
  const encode = profile.purpose === 44 ? p2pkhAddress : p2wpkhAddress;
  return {
    ...keys,
    address: (publicKey) => {
      const details = encode(publicKey, LITECOIN_ADDRESS);
      return { address: details.address, scheme: "litecoin", details: utxoAddressDetails(details) };
    },
  };
}

/** The derivation of a Litecoin adapter id; undefined for another coin's. */
export function litecoinDerivation(id: string) {
  return bip44CoinDerivation(LITECOIN_PROFILES, litecoinKeys, id);
}
