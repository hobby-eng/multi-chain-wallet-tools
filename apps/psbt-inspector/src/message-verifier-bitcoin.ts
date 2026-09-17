import { verifyBitcoinSignedMessage } from './bitcoin-message-verifier.js';
import type { MessageVerification } from './dash-message-verifier.js';
import type { PsbtChain, PsbtNetwork } from './psbt.js';

export type { MessageVerification };

export async function verifySignedMessage(
  address: string,
  message: string,
  signature: string,
  chain: PsbtChain,
  network: PsbtNetwork,
): Promise<MessageVerification> {
  if (chain !== 'bitcoin') throw new Error('This build verifies Bitcoin messages only.');
  return verifyBitcoinSignedMessage(address, message, signature, network);
}
