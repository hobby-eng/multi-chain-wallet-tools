import { bech32 } from '@scure/base';
import { bytesToHex, hash160 } from '@ckd/core/crypto.js';
import type { BitcoinNetwork } from '@ckd/core/networks.js';

export function deriveNativeSegwitAddress(publicKey: Uint8Array, network: BitcoinNetwork) {
  const publicKeyHash = hash160(publicKey);
  return {
    address: bech32.encode(network.bech32Hrp, [0, ...bech32.toWords(publicKeyHash)]),
    publicKeyHashHex: bytesToHex(publicKeyHash),
    witnessProgramHex: bytesToHex(publicKeyHash),
    scriptPubKeyHex: `0014${bytesToHex(publicKeyHash)}`,
  };
}
