import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/**
 * Bitcoin Cash's P2PKH profiles: its own coin type 145 (SLIP-44), and Bitcoin's coin type 0, which
 * wallets made before or right after the 2017 fork kept; MHFE's wallet check searches both.
 */
export const BITCOIN_CASH_PROFILES: readonly Bip44CoinProfile[] = Object.freeze([
  new Bip44CoinProfile({
    adapterId: "bitcoin-cash",
    group: "Bitcoin Cash",
    variantLabel: "BIP44 · coin type 145",
    outputType: "P2PKH",
    purpose: 44,
    coinType: 145,
    branches: "receive-change",
    defaultVariant: true,
  }),
  new Bip44CoinProfile({
    adapterId: "bitcoin-cash-coin-type-0",
    group: "Bitcoin Cash",
    variantLabel: "BIP44 · coin type 0",
    outputType: "P2PKH",
    purpose: 44,
    coinType: 0,
    branches: "receive-change",
  }),
]);

/** Bitcoin Cash kept Bitcoin's base58 versions (P2PKH 0, P2SH 5) and WIF 0x80; CashAddr's prefix. */
export const BITCOIN_CASH_ADDRESS = Object.freeze({
  prefix: "bitcoincash",
  p2pkh: 0x00,
  p2sh: 0x05,
  wif: 0x80,
});
