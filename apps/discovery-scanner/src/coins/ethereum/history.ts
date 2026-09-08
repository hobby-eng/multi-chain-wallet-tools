import { historyGateway } from '../../history.js';
import type { RecoveryCoinAdapter } from '../../types.js';
export const getEthereumHistory: NonNullable<RecoveryCoinAdapter['getHistory']> = async (finding, _section, network, context) => {
  const gateway = historyGateway(context);
  return gateway.runPublic({ coin: 'ethereum', network, address: finding.title }, 'address.history',
    () => context.networkApi.addressHistory('ethereum', network, finding.title, context.signal), context.signal);
};
