import { keyAggregate } from '@scure/btc-signer/musig2.js';

export function aggregateMusigParticipants(participants: readonly Uint8Array[]): Uint8Array {
  return keyAggregate([...participants]).aggPublicKey.toBytes(true);
}
