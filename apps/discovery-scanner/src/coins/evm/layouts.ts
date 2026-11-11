// The address layouts that an EVM network's seed scan checks. Every EVM wallet can hold a network's
// coins at Ethereum's coin type 60: MetaMask derives every network there, and coins sent to an
// Ethereum address reach the same 0x account on any EVM network. A network whose own wallets lay
// out their addresses otherwise (Ethereum Classic: its coin type 61 and Ledger's legacy path) brings
// them as its Deriver coin's public address scheme, and they are checked first.
import { BIP32_BRANCH_SIZE } from "@ckd/core/bip32-limits.js";
import type { AddressLayout, CoinAddressScheme } from "@ckd/coins/address-scheme.js";
import type { EvmNetworkFacts } from "@ckd/public-data-providers/evm-network-facts.js";

/** Ethereum's coin type (SLIP-44), at which EVM wallets derive 0x accounts on any EVM network. */
const ETHEREUM_COIN_TYPE = 60;

/** BIP44's address index under the scan's account a: m/44'/60'/a'/0/i. */
function addressIndex(id: string, label: string): AddressLayout {
  return Object.freeze({
    id,
    label,
    path: (account: number, index: number) => `m/44'/${ETHEREUM_COIN_TYPE}'/${account}'/0/${index}`,
    maximumCount: () => BIP32_BRANCH_SIZE,
  });
}

/** Ledger Live's account index, its accounts counted from the scan's account a: m/44'/60'/i'/0/0. */
function accountIndex(id: string, label: string): AddressLayout {
  return Object.freeze({
    id,
    label,
    path: (account: number, index: number) =>
      `m/44'/${ETHEREUM_COIN_TYPE}'/${account + index}'/0/0`,
    maximumCount: (account: number) => BIP32_BRANCH_SIZE - account,
  });
}

/** The legacy Ledger / MEW layout m/44'/60'/0'/i, which has no account level of its own. */
function legacyLedger(id: string, label: string): AddressLayout {
  return Object.freeze({
    id,
    label,
    path: (_account: number, index: number) => `m/44'/${ETHEREUM_COIN_TYPE}'/0'/${index}`,
    maximumCount: () => BIP32_BRANCH_SIZE,
  });
}

/** Ethereum's three layouts, as a network whose wallets derive at coin type 60 names them. */
const ETHEREUM_LAYOUTS: readonly AddressLayout[] = Object.freeze([
  addressIndex("standard", "Standard BIP44 · MetaMask / Trezor"),
  accountIndex("ledger-live", "Ledger Live accounts"),
  legacyLedger("ledger-legacy", "Legacy Ledger / MEW"),
]);

/** The same three layouts on a network whose own wallets have layouts of their own. */
const ETHEREUM_LAYOUTS_ELSEWHERE: readonly AddressLayout[] = Object.freeze([
  addressIndex("ethereum-standard", "Ethereum's BIP44 · MetaMask · m/44'/60'/a'/0/i"),
  accountIndex("ethereum-ledger-live", "Ethereum's Ledger Live accounts · m/44'/60'/i'/0/0"),
  legacyLedger("ethereum-ledger-legacy", "Ethereum's legacy Ledger / MEW · m/44'/60'/0'/i"),
]);

/**
 * The layouts of an EVM network, in scan order: its own wallets' layouts (`own`, its Deriver coin's
 * public address scheme), then Ethereum's three at coin type 60.
 */
export function evmLayouts(own?: CoinAddressScheme): readonly AddressLayout[] {
  return own === undefined ? ETHEREUM_LAYOUTS : [...own.layouts, ...ETHEREUM_LAYOUTS_ELSEWHERE];
}

/**
 * The custom path an EVM network's editor starts from: the first own layout's first path at account
 * 0, its last level the template's index (Ethereum Classic's m/44'/61'/0'/0/{index}), or Ethereum's.
 */
export function evmCustomPathTemplate(own?: CoinAddressScheme): string {
  const [first] = evmLayouts(own);
  if (first === undefined) throw new Error("An EVM network has no layout.");
  const path = first.path(0, 0);
  return `${path.slice(0, path.lastIndexOf("/"))}/{index}`;
}

/**
 * What a network whose own wallets have layouts of their own says about them; undefined for a
 * network whose wallets derive at Ethereum's coin type only.
 */
export function evmOwnLayoutsNote(
  facts: Pick<EvmNetworkFacts, "label" | "asset">,
  own?: CoinAddressScheme,
): string | undefined {
  if (own === undefined) return undefined;
  return `${facts.label}'s own wallets' layouts come first; the layouts at Ethereum's coin type 60 find EVM wallets such as MetaMask used on ${facts.label}, and ${facts.asset} sent to an Ethereum address.`;
}
