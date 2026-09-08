import { historyGateway } from '../../history.js';
import type { RecoveryCoinAdapter } from '../../types.js';
export const getBitcoinHistory: NonNullable<RecoveryCoinAdapter['getHistory']> = async (finding, _section, network, context) => {
  const gateway = historyGateway(context);
  return gateway.runPublic({ coin: 'bitcoin', network, address: finding.title }, 'address.history',
    () => context.networkApi.addressHistory('bitcoin', network, finding.title, context.signal), context.signal);
};
