import type { NetworkName } from '@ckd/core/types.js';

export type PublicRecoveryRequestInput =
  | {
      operation: 'address.history';
      payload: { coin: 'bitcoin' | 'ethereum'; network: NetworkName; address: string };
    }
  | { operation: 'utxo.addresses'; payload: { network: NetworkName; addresses: string[] } }
  | { operation: 'evm.accounts'; payload: { network: NetworkName; addresses: string[] } };
