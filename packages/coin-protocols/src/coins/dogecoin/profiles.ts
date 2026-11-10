import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** Dogecoin's one single-key profile, P2PKH under its coin type 3 (SLIP-44). */
export const DOGECOIN_PROFILES = Bip44CoinProfile.single({
  adapterId: "dogecoin",
  group: "Dogecoin",
  variantLabel: "BIP44",
  coinType: 3,
  branches: "receive-change",
  outputType: "P2PKH",
});

/**
 * Dogecoin Core's mainnet chainparams (master, read 2026-11-10): P2PKH 30 ("D…"), P2SH 22, WIF 158,
 * extended keys dgpv 0x02fac398 and dgub 0x02facafd.
 */
export const DOGECOIN_ADDRESS = Object.freeze({
  p2pkh: 30,
  p2sh: 22,
  wif: 158,
  versions: Object.freeze({ private: 0x02fac398, public: 0x02facafd }),
});
