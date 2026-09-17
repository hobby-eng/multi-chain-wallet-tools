import { signCompactMessage } from './compact-message-internal.js';
import type { CompactMessageSignature } from './compact-message-internal.js';
import type { NetworkName } from './types.js';

export function signDashCompactP2pkhMessage(
  privateKey: Uint8Array,
  address: string,
  message: string,
  network: NetworkName,
): CompactMessageSignature {
  return signCompactMessage(privateKey, address, message, {
    magic: 'DarkCoin Signed Message:\n',
    p2pkhPrefix: network === 'mainnet' ? 0x4c : 0x8c,
    format: 'Dash Core compact P2PKH',
  });
}
