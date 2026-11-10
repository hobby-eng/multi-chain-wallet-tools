import { Bip44CoinProfile } from "../bip44-coin-profile.js";
import { Ed25519CoinProfile } from "../ed25519-coin-profile.js";

/**
 * Hedera's Ed25519 keys as the Hiero (Hedera) SDK's toStandardEd25519PrivateKey derives them,
 * m/44'/3030'/0'/0'/i' by SLIP-10, the keys of HashPack and of Hedera's own wallets.
 */
export const HEDERA_ED25519_PROFILES: readonly Ed25519CoinProfile[] = Object.freeze([
  new Ed25519CoinProfile({
    adapterId: "hedera",
    group: "Hedera",
    variantLabel: "Ed25519 · m/44'/3030'/0'/0'/i'",
    levels: [44, 3030, 0, 0, "index"],
    defaultVariant: true,
  }),
]);

/** Hedera's ECDSA keys as the SDK's toStandardECDSAsecp256k1PrivateKey derives them, m/44'/3030'/0'/0/i. */
export const HEDERA_ECDSA_PROFILES: readonly Bip44CoinProfile[] = Object.freeze([
  new Bip44CoinProfile({
    adapterId: "hedera-ecdsa",
    group: "Hedera",
    variantLabel: "ECDSA · BIP44",
    outputType: "",
    purpose: 44,
    coinType: 3030,
    branches: "address-branch",
  }),
]);

/** The DER prefix of an Ed25519 SubjectPublicKeyInfo, as the Hiero SDK writes a public key. */
export const HEDERA_ED25519_PUBLIC_DER = "302a300506032b6570032100";
