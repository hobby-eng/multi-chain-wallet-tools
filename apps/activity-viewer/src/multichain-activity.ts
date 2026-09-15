import { PublicMultiChainDataService } from '@ckd/public-data-providers/multi-chain-service.js';
import { createBitcoinActivityAdapter } from './activity-bitcoin.js';
import { createEthereumActivityAdapter } from './activity-ethereum.js';
import { installExternalActivity } from './external-activity.js';
import type { ActivityViewerView } from './view.js';

/** Complete-build compatibility entrypoint; selective builds import the generated adapter list directly. */
export function installMultiChainActivity(
  document: Document,
  view: Pick<ActivityViewerView, 'canStartQuery' | 'isQueryRunning' | 'setExternalRunning'>,
): void {
  const service = new PublicMultiChainDataService();
  installExternalActivity(document, view, [
    createBitcoinActivityAdapter({
      addressHistory: (network, address, signal) => service.addressHistory('bitcoin', network, address, signal),
      utxoAddresses: (network, addresses, signal) => service.utxoAddresses(network, addresses, signal),
    }),
    createEthereumActivityAdapter({
      addressHistory: (network, address, signal) => service.addressHistory('ethereum', network, address, signal),
      evmAccounts: (network, addresses, signal) => service.evmAccounts(network, addresses, signal),
    }),
  ]);
}
