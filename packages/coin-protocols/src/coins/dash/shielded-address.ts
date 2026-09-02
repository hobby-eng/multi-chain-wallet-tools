import { bech32m } from '@scure/base';
import { concatBytes } from '@ckd/core/crypto.js';

export const ORCHARD_ADDRESS_TYPE = 0x10;

export function encodeDashShieldedAddress(rawAddress: Uint8Array, hrp: string): string {
  if (rawAddress.length !== 43) throw new Error('A raw Dash Orchard address must contain 43 bytes.');
  const displayPayload = concatBytes(Uint8Array.of(ORCHARD_ADDRESS_TYPE), rawAddress);
  return bech32m.encode(hrp, bech32m.toWords(displayPayload));
}
