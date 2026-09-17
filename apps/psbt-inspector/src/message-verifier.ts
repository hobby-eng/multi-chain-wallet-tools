import { verifyBitcoinSignedMessage } from './bitcoin-message-verifier.js';
import { verifyDashSignedMessage, type MessageVerification } from './dash-message-verifier.js';
import type { PsbtChain, PsbtNetwork } from './psbt.js';

export type { MessageVerification };

export function verifySignedMessage(
  address: string,
  message: string,
  signature: string,
  chain: PsbtChain,
  network: PsbtNetwork,
): Promise<MessageVerification> {
  return chain === 'dash'
    ? verifyDashSignedMessage(address, message, signature, network)
    : verifyBitcoinSignedMessage(address, message, signature, network);
}
