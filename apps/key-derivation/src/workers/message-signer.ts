import { hexToBytes, wipe } from '@ckd/core/crypto.js';
import { signCompactP2pkhMessage } from '@ckd/core/compact-message.js';
import type { ResultField } from '@ckd/core/types.js';
import type { MessageSigningFormat } from './protocol.js';
import { signBip322Message } from './bip322-signer.js';

export async function signDerivedMessage(
  privateKeyHex: string,
  address: string,
  message: string,
  network: 'mainnet' | 'testnet',
  format: MessageSigningFormat,
  fields: readonly ResultField[],
) {
  const privateKey = hexToBytes(privateKeyHex);
  try {
    if (format === 'bitcoin-compact' || format === 'dash-compact') {
      return signCompactP2pkhMessage(
        privateKey,
        address,
        message,
        format === 'bitcoin-compact' ? 'bitcoin' : 'dash',
        network,
      );
    }
    return signBip322Message(
      privateKeyHex,
      address,
      message,
      network,
      format === 'bitcoin-bip322-legacy'
        ? 'legacy-p2pkh'
        : format === 'bitcoin-bip322-nested'
        ? 'nested-segwit'
        : format === 'bitcoin-bip322-native' ? 'native-segwit' : 'taproot',
      fields.find((field) => field.key === 'scriptPubKey')?.value ?? '',
      fields.find((field) => field.key === 'redeemScript')?.value,
      fields.find((field) => field.key === 'internalPublicKey')?.value,
    );
  } finally {
    wipe(privateKey);
  }
}
