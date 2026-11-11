import type { FixedPathLayout } from "../bip44-coin.js";
import { Bip44CoinProfile } from "../bip44-coin-profile.js";

/** Ethereum Classic's profile under its coin type 61 (SLIP-44); wallets that keep it at Ethereum's 60 show the Ethereum addresses. */
export const ETHEREUM_CLASSIC_PROFILES = Bip44CoinProfile.single({
  adapterId: "ethereum-classic",
  group: "Ethereum Classic",
  variantLabel: "BIP44 · coin type 61",
  coinType: 61,
  branches: "address-branch",
});

/**
 * Ledger's legacy Ethereum Classic path m/44'/60'/160720'/0'/i: Ledger Live's `etcM` derivation mode
 * (LedgerHQ/ledger-live libs/ledger-wallet-framework/src/derivation.ts,
 * "44'/60'/160720'/0'/<account>")
 * and MyEtherWallet's Ledger "Ethereum Classic" path (src/modules/access-wallet/hardware/handlers/
 * configs/configPaths.js, "m/44'/60'/160720'/0'"). The Deriver has no row of it; the Discovery
 * Scanner looks it up.
 */
export const ETHEREUM_CLASSIC_LEDGER_LEGACY: FixedPathLayout = Object.freeze({
  id: "ethereum-classic-ledger-legacy",
  label: "Ledger legacy Ethereum Classic / MEW · m/44'/60'/160720'/0'/i",
  hardened: Object.freeze([44, 60, 160720, 0]),
});
