import { bytesToHex, encodeP2pkh, hash160 } from '@ckd/core/crypto.js';
import type { BitcoinNetwork } from '@ckd/core/networks.js';

export function deriveLegacyAddress(publicKey: Uint8Array, network: BitcoinNetwork) {
  const publicKeyHash = hash160(publicKey);
  return {
    address: encodeP2pkh(publicKeyHash, network.p2pkh),
    publicKeyHashHex: bytesToHex(publicKeyHash),
    scriptPubKeyHex: `76a914${bytesToHex(publicKeyHash)}88ac`,
  };
}
