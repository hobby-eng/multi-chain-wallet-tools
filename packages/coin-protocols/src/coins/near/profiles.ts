import { Ed25519CoinProfile } from "../ed25519-coin-profile.js";

/** NEAR's keys: m/44'/397'/i' under its coin type 397, near-seed-phrase's path for i = 0. */
export const NEAR_PROFILES: readonly Ed25519CoinProfile[] = Object.freeze([
  new Ed25519CoinProfile({
    adapterId: "near",
    group: "NEAR",
    variantLabel: "m/44'/397'/i'",
    levels: [44, 397, "index"],
    defaultVariant: true,
  }),
]);
