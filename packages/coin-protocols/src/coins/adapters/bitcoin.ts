import {
  BIP44_ADDRESS_BRANCHES,
  indexRange,
  TRANSPARENT_ROLES,
  type CoinAdapter,
} from '../registry-base.js';

function bitcoinAdapter(
  id: string,
  label: string,
  variantLabel: string,
  purpose: number,
  defaultVariant = false,
): CoinAdapter {
  return {
    id,
    group: 'Bitcoin',
    label,
    variantLabel,
    defaultVariant,
    networkControl: true,
    addressBranches: BIP44_ADDRESS_BRANCHES,
    defaults: { network: 'mainnet', account: 0, branch: 0, start: 0, count: 20 },
    fieldRoles: TRANSPARENT_ROLES,
    pathPreview: ({ network, account, branch, start, count }) =>
      `m/${purpose}'/${network === 'mainnet' ? 0 : 1}'/${account}'/${branch}/${indexRange(start, count)}`,
  };
}

export const BITCOIN_COIN_ADAPTERS: readonly CoinAdapter[] = [
  bitcoinAdapter('bitcoin-legacy', 'Legacy · BIP44 / P2PKH', 'Legacy · BIP44', 44),
  bitcoinAdapter('bitcoin-nested-segwit', 'Nested SegWit · BIP49 / P2SH-P2WPKH', 'Nested SegWit · BIP49', 49),
  bitcoinAdapter('bitcoin-native-segwit', 'Native SegWit · BIP84 / P2WPKH', 'Native SegWit · BIP84', 84),
  bitcoinAdapter('bitcoin-taproot', 'Taproot · BIP86 / P2TR', 'Taproot · BIP86', 86, true),
] as const;
