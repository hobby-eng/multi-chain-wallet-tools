import { Ed25519CoinProfile } from "../ed25519-coin-profile.js";

/** Stellar's accounts by SEP-0005: m/44'/148'/i' under its coin type 148 (SLIP-44). */
export const STELLAR_PROFILES: readonly Ed25519CoinProfile[] = Object.freeze([
  new Ed25519CoinProfile({
    adapterId: "stellar",
    group: "Stellar",
    variantLabel: "SEP-0005 · m/44'/148'/i'",
    levels: [44, 148, "index"],
    defaultVariant: true,
  }),
]);
