import { bytesToHex } from "@ckd/core/crypto.js";
import { BIP32_MAINNET_VERSIONS } from "@ckd/core/networks.js";
import {
  field,
  paymentAddressField,
  type Bip32BatchOptions,
  type DerivationResult,
} from "@ckd/core/types.js";
import { combinedAddressScheme } from "../address-scheme.js";
import { bip44CoinAddresses, bip44CoinDerivation, type Bip44CoinKeys } from "../bip44-coin.js";
import {
  ed25519CoinAddresses,
  ed25519CoinDerivation,
  type Ed25519CoinKeys,
} from "../ed25519-coin.js";
import { evmAddressOfKey } from "../keccak-account.js";
import { hederaEcdsaAlias, hederaEd25519Alias } from "./account.js";
import {
  HEDERA_ECDSA_PROFILES,
  HEDERA_ECDSA_PUBLIC_DER,
  HEDERA_ED25519_PROFILES,
  HEDERA_ED25519_PUBLIC_DER,
} from "./profiles.js";

// The DER prefix of the Hiero SDK's Ed25519 private key string (toStringDer), PKCS#8; the public
// keys' prefixes are in profiles.ts. An ECDSA private key is shown as its 32-byte hex, which
// Hedera's wallets import.
const ED25519_PRIVATE_DER = "302e020100300506032b657004220420";

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
        paymentAddressField("address", "Account alias (HIP-32)", hederaEd25519Alias(publicKey)),
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
      field(
        "publicKeyDer",
        "Public key (DER)",
        `${HEDERA_ECDSA_PUBLIC_DER}${bytesToHex(publicKey)}`,
      ),
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

/**
 * Hedera's public lookups for the connected tools: each key's alias 0.0.<DER public key>, which the
 * network maps to every account holding the key; an ECDSA key's alias also names the account of its
 * EVM address alias. The Ed25519 aliases are the rows' addresses; an ECDSA alias is its row's public
 * key in DER, since a row's EVM address does not name the key. The layouts are the Deriver's two
 * variants; the ECDSA keys get no Ledger Live account-index layout, which is a form of Ledger
 * Live's secp256k1 coins, not of Hedera's.
 */
export const HEDERA_ADDRESSES = combinedAddressScheme(
  [
    ed25519CoinAddresses(HEDERA_ED25519_PROFILES, hederaEd25519Alias),
    bip44CoinAddresses(
      HEDERA_ECDSA_PROFILES,
      { ...HEDERA_ECDSA_KEYS, address: (publicKey) => ({ address: hederaEcdsaAlias(publicKey) }) },
      { accountIndex: false },
    ),
  ],
  "An account whose key is a key list or a threshold key is not read from the seed: where the mirror node lists it under one of the seed's keys, that key's lookup fails instead of skipping it. The Activity Viewer reads such an account by its number.",
);
