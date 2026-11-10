import { bytesToHex } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
} from "@ckd/core/types.js";
import { bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import { ed25519CoinDerivation, type Ed25519CoinKeys } from "../ed25519-coin.js";
import { evmAddressOfKey } from "../keccak-account.js";
import {
  HEDERA_ECDSA_PROFILES,
  HEDERA_ED25519_PROFILES,
  HEDERA_ED25519_PUBLIC_DER,
} from "./profiles.js";

// The DER prefixes of the Hiero SDK's key strings (toStringDer): SubjectPublicKeyInfo of an Ed25519
// or compressed secp256k1 key, and PKCS#8 of an Ed25519 private key. An ECDSA private key is shown
// as its 32-byte hex, which Hedera's wallets import.
const ED25519_PRIVATE_DER = "302e020100300506032b657004220420";
const ECDSA_PUBLIC_DER = "302d300706052b8104000a032200";

const ACCOUNT_NOTICE =
  "Hedera numbers an account (0.0.N) when the network creates it. Sending HBAR to the alias shown creates the account (HIP-32), and wallets then show its number; the Discovery Scanner looks the number up.";

/** Hedera's Ed25519 key forms: the public-key alias, and the SDK's DER key strings. */
export const HEDERA_ED25519_KEYS: Ed25519CoinKeys = {
  networkLabel: "Hedera mainnet",
  notices: [ACCOUNT_NOTICE],
  fields: (privateKey, publicKey) => {
    const publicDer = `${HEDERA_ED25519_PUBLIC_DER}${bytesToHex(publicKey)}`;
    return {
      basic: [
        paymentAddressField("address", "Account alias (HIP-32)", `0.0.${publicDer}`),
        field("publicKey", "Public key (DER)", publicDer),
        field(
          "privateKey",
          "Private key (DER)",
          `${ED25519_PRIVATE_DER}${bytesToHex(privateKey)}`,
          true,
        ),
      ],
      advanced: [field("privateKeyHex", "Private key (32-byte hex)", bytesToHex(privateKey), true)],
    };
  },
};

/** Hedera's ECDSA key forms: the EVM address alias, and the SDK's DER key strings. */
export const HEDERA_ECDSA_KEYS: Bip44CoinKeys = {
  networkLabel: "Hedera mainnet",
  versions: BIP32_MAINNET_VERSIONS,
  notices: [ACCOUNT_NOTICE],
  address: (publicKey) => ({
    address: evmAddressOfKey(publicKey),
    details: [
      field("publicKeyDer", "Public key (DER)", `${ECDSA_PUBLIC_DER}${bytesToHex(publicKey)}`),
    ],
  }),
};

/** The derivation of a Hedera adapter id, Ed25519 or ECDSA; undefined for another coin's. */
export function hederaDerivation(
  id: string,
): ((options: Bip32BatchOptions) => DerivationResult) | undefined {
  return (
    ed25519CoinDerivation(HEDERA_ED25519_PROFILES, HEDERA_ED25519_KEYS, id) ??
    bip44CoinDerivation(HEDERA_ECDSA_PROFILES, () => HEDERA_ECDSA_KEYS, id)
  );
}
