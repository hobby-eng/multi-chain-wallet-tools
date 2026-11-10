import { Bip44CoinProfile } from "../bip44-coin-profile.js";

const MODES = [
  { mode: "legacy", variantLabel: "Legacy · BIP44", outputType: "P2PKH", purpose: 44 },
  {
    mode: "nested-segwit",
    variantLabel: "Nested SegWit · BIP49",
    outputType: "P2SH-P2WPKH",
    purpose: 49,
  },
  {
    mode: "native-segwit",
    variantLabel: "Native SegWit · BIP84",
    outputType: "P2WPKH",
    purpose: 84,
  },
] as const;

/** Litecoin's single-key profiles under its coin type 2 (SLIP-44); native SegWit is the default. */
export const LITECOIN_PROFILES: readonly Bip44CoinProfile[] = Object.freeze(
  MODES.map(
    ({ mode, ...facts }) =>
      new Bip44CoinProfile({
        ...facts,
        adapterId: `litecoin-${mode}`,
        group: "Litecoin",
        coinType: 2,
        branches: "receive-change",
        defaultVariant: facts.purpose === 84,
      }),
  ),
);

/**
 * Litecoin Core's mainnet chainparams (master, read 2026-11-10): P2PKH 48 ("L…"), P2SH 50 ("M…"),
 * the old P2SH version 5 ("3…") that early wallets showed for the same scripts, WIF 176, Bitcoin's
 * xpub/xprv, bech32 "ltc".
 */
export const LITECOIN_ADDRESS = Object.freeze({
  p2pkh: 48,
  p2sh: 50,
  oldP2sh: 5,
  bech32Hrp: "ltc",
  wif: 176,
});
