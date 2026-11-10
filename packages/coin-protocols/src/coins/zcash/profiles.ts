import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** Zcash's transparent P2PKH profile under its coin type 133 (SLIP-44). */
export const ZCASH_PROFILES = Bip44CoinProfile.single({
  adapterId: "zcash",
  group: "Zcash",
  variantLabel: "Transparent · BIP44",
  coinType: 133,
  branches: "receive-change",
  outputType: "P2PKH",
});

/** zcashd's mainnet chainparams (master, read 2026-11-10): transparent P2PKH 0x1CB8 ("t1…"), WIF 0x80. */
export const ZCASH_ADDRESS = Object.freeze({ t1: Object.freeze([0x1c, 0xb8]), wif: 0x80 });
