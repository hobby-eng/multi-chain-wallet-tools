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
  if (chain !== 'dash') throw new Error('The Dash Community build verifies Dash messages only.');
  return verifyDashSignedMessage(address, message, signature, network);
}
