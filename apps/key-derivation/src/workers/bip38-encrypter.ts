import { encryptBip38 } from '@ckd/core/bip38.js';
import { getBitcoinNetwork, getDashNetwork } from '@ckd/core/networks.js';

export function encryptDerivedP2pkhKey(
  privateKey: Uint8Array,
  adapterId: string,
  networkName: 'mainnet' | 'testnet',
  passphrase: string,
) {
  const network = adapterId.startsWith('dash-')
    ? getDashNetwork(networkName)
    : getBitcoinNetwork(networkName);
  return encryptBip38(privateKey, true, passphrase, network);
}
