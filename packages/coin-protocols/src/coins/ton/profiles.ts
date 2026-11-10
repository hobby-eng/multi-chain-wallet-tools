import { Ed25519CoinProfile } from "../ed25519-coin-profile.js";

/**
 * TON's BIP39 variants under its coin type 607 (SLIP-44), both by SLIP-10: Trust Wallet's
 * m/44'/607'/i' (wallet-core's registry; v4R2 by default), and Ledger's m/44'/607'/0'/0'/i'/0'
 * (ton-ledger-ts pathForAccount: mainnet, basechain, account i, the last level reserved; v4 by
 * default). The TON phrase of the Telegram wallet is a variant of its own (TON_STANDARD_ADAPTER).
 */
export const TON_BIP39_PROFILES: readonly Ed25519CoinProfile[] = Object.freeze([
  new Ed25519CoinProfile({
    adapterId: "ton-trust",
    group: "TON",
    variantLabel: "Trust Wallet · m/44'/607'/i'",
    levels: [44, 607, "index"],
    // Any BIP39 phrase has these keys; only a TON phrase has the Telegram wallet's.
    defaultVariant: true,
  }),
  new Ed25519CoinProfile({
    adapterId: "ton-ledger",
    group: "TON",
    variantLabel: "Ledger · m/44'/607'/0'/0'/i'/0'",
    levels: [44, 607, 0, 0, "index", 0],
  }),
]);

/** The adapter id of the TON phrase's wallet, the Telegram wallet and TON's standard wallets. */
export const TON_STANDARD_ADAPTER = "ton";

/** What stands for the path of a TON phrase's one key: its PBKDF2 salt. */
export const TON_STANDARD_PATH = "TON phrase · PBKDF2-SHA512 “TON default seed”";
