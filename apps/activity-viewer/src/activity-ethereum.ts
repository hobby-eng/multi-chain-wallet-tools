import { normalizeEthereumAddress } from '@ckd/public-data-providers/address-normalization.js';
import { EthereumPublicDataService } from '@ckd/public-data-providers/ethereum-service.js';
import type { ExternalActivityAdapter } from './external-activity.js';

type EthereumActivityService = Pick<EthereumPublicDataService, 'addressHistory' | 'evmAccounts'>;

export function createEthereumActivityAdapter(
  service: EthereumActivityService = new EthereumPublicDataService(),
): ExternalActivityAdapter {
  return {
    id: 'ethereum',
    label: 'Ethereum',
    asset: 'ETH',
    decimals: 18,
    singlePlaceholder: 'Paste an Ethereum 0x address',
    batchPlaceholder: 'One Ethereum address per line',
    normalize: (value) => normalizeEthereumAddress(value),
    dedupeKey: (value) => value.toLowerCase(),
    async query(address, network, signal) {
      const [history, accounts] = await Promise.all([
        service.addressHistory(network, address, signal),
        service.evmAccounts(network, [address], signal),
      ]);
      const account = accounts.entries[0]!;
      return {
        coin: 'ethereum',
        address: account.address,
        balanceAtomic: BigInt(account.balance),
        nonce: BigInt(account.nonce),
        blockHeight: BigInt(accounts.blockNumber),
        history,
      };
    },
  };
}

export const ETHEREUM_ACTIVITY_ADAPTER = createEthereumActivityAdapter();
