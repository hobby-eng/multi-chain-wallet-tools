import { hexToBytes, wipe } from '@ckd/core/crypto.js';
import { signDashCompactP2pkhMessage } from '@ckd/core/compact-message-dash.js';
import type { ResultField } from '@ckd/core/types.js';
import type { MessageSigningFormat } from './protocol.js';

export function signDerivedMessage(
  privateKeyHex: string,
  address: string,
  message: string,
  network: 'mainnet' | 'testnet',
  format: MessageSigningFormat,
  _fields: readonly ResultField[],
) {
  if (format !== 'dash-compact') throw new Error('This build supports Dash compact-message signing only.');
  const privateKey = hexToBytes(privateKeyHex);
  try {
    return signDashCompactP2pkhMessage(privateKey, address, message, network);
  } finally {
    wipe(privateKey);
  }
}
