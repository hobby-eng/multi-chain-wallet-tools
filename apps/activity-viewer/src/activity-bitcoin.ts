import { normalizeBitcoinAddress } from '@ckd/public-data-providers/address-normalization.js';
import { BitcoinPublicDataService } from '@ckd/public-data-providers/bitcoin-service.js';
import type { ExternalActivityAdapter } from './external-activity.js';

type BitcoinActivityService = Pick<BitcoinPublicDataService, 'addressHistory' | 'utxoAddresses'>;

export function createBitcoinActivityAdapter(
  service: BitcoinActivityService = new BitcoinPublicDataService(),
): ExternalActivityAdapter {
  return {
    id: 'bitcoin',
    label: 'Bitcoin',
    asset: 'BTC',
    decimals: 8,
    singlePlaceholder: 'Paste a Bitcoin address',
    batchPlaceholder: 'One Bitcoin address per line',
    normalize: normalizeBitcoinAddress,
    dedupeKey: (value) => value,
    async query(address, network, signal) {
      const [history, entries] = await Promise.all([
        service.addressHistory(network, address, signal),
        service.utxoAddresses(network, [address], signal),
      ]);
      return {
        coin: 'bitcoin',
        address,
        balanceAtomic: BigInt(entries[0]!.balance),
        nonce: null,
        blockHeight: null,
        history,
      };
    },
  };
}

export const BITCOIN_ACTIVITY_ADAPTER = createBitcoinActivityAdapter();
