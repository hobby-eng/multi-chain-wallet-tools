import { Ed25519CoinProfile } from "../ed25519-coin-profile.js";

/**
 * Solana's variants under its coin type 501 (SLIP-44): m/44'/501'/i'/0', the account of Phantom,
 * Solflare and Backpack and of solana-keygen's "?key=i/0", and m/44'/501'/i', Ledger Live's account.
 */
export const SOLANA_PROFILES: readonly Ed25519CoinProfile[] = Object.freeze([
  new Ed25519CoinProfile({
    adapterId: "solana",
    group: "Solana",
    variantLabel: "Phantom, Solflare · m/44'/501'/i'/0'",
    levels: [44, 501, "index", 0],
    defaultVariant: true,
  }),
  new Ed25519CoinProfile({
    adapterId: "solana-ledger",
    group: "Solana",
    variantLabel: "Ledger · m/44'/501'/i'",
    levels: [44, 501, "index"],
  }),
]);
