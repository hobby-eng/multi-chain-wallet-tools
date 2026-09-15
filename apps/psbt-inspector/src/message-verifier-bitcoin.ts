import { verifyCompactP2pkhMessage } from '@ckd/core/compact-message.js';
import { verifyBip322Message } from '@ckd/core/bip322-verifier.js';
import type { MessageVerification } from './dash-message-verifier.js';
import type { PsbtChain, PsbtNetwork } from './psbt.js';

export type { MessageVerification };

function isCompactSignature(signature: string): boolean {
  try {
    const decoded = atob(signature.replaceAll(/\s+/gu, ''));
    const header = decoded.charCodeAt(0);
    return decoded.length === 65 && header >= 27 && header <= 34;
  } catch {
    return false;
  }
}

export async function verifySignedMessage(
  address: string,
  message: string,
  signature: string,
  chain: PsbtChain,
  network: PsbtNetwork,
): Promise<MessageVerification> {
  if (chain !== 'bitcoin') throw new Error('This build verifies Bitcoin messages only.');
  if (isCompactSignature(signature)) {
    return {
      valid: verifyCompactP2pkhMessage(
        address,
        message,
        signature,
        'bitcoin',
        network === 'regtest' ? 'testnet' : network,
      ),
      format: 'Bitcoin compact P2PKH (BIP137)',
      recoveredAddress: address.trim(),
      recoveredPublicKey: null,
      messageMagic: 'Bitcoin signed-message domain',
      timeConstraints: 'Not applicable',
    };
  }
  const result = await verifyBip322Message(message, address, signature, network);
  const prefix = signature.trim().slice(0, 3);
  return {
    valid: result.valid,
    format:
      prefix === 'ful'
        ? 'BIP-322 full'
        : prefix === 'pof'
          ? 'BIP-322 proof of funds'
          : prefix === 'smp'
            ? 'BIP-322 simple'
            : 'BIP-322 simple or legacy compact',
    recoveredAddress: address.trim(),
    recoveredPublicKey: null,
    messageMagic: 'BIP0322-signed-message tagged hash',
    timeConstraints: result.timeConstraints === undefined ? 'None reported' : JSON.stringify(result.timeConstraints),
  };
}
