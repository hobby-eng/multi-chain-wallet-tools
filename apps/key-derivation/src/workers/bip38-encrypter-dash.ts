import { encryptBip38 } from '@ckd/core/bip38.js';
import { getDashNetwork } from '@ckd/core/networks.js';

export function encryptDerivedP2pkhKey(
  privateKey: Uint8Array,
  adapterId: string,
  networkName: 'mainnet' | 'testnet',
  passphrase: string,
) {
  if (!adapterId.startsWith('dash-')) throw new Error('This build supports BIP38 for Dash P2PKH keys only.');
  return encryptBip38(privateKey, true, passphrase, getDashNetwork(networkName));
}
