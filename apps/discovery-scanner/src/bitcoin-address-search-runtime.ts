import { deriveBitcoin, type BitcoinMode } from '@ckd/coins/bitcoin/index.js';
import { BITCOIN_COIN_ADAPTERS } from '@ckd/coins/adapters/bitcoin.js';
import type { RuntimeCoinAdapter } from '@ckd/coins/runtime-registry.js';

const MODES: Readonly<Record<string, BitcoinMode>> = {
  'bitcoin-legacy': 'legacy',
  'bitcoin-nested-segwit': 'nested-segwit',
  'bitcoin-native-segwit': 'native-segwit',
  'bitcoin-taproot': 'taproot',
};

export function getBitcoinAddressSearchAdapter(id: string): RuntimeCoinAdapter {
  const metadata = BITCOIN_COIN_ADAPTERS.find((adapter) => adapter.id === id);
  const mode = MODES[id];
  if (metadata === undefined || mode === undefined) throw new Error(`Unsupported Bitcoin address profile: ${id}.`);
  return { ...metadata, derive: (input) => deriveBitcoin(mode, input) };
}
