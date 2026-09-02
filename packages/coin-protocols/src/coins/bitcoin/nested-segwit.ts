import { bytesToHex, concatBytes, encodeP2sh, hash160 } from '@ckd/core/crypto.js';
import type { BitcoinNetwork } from '@ckd/core/networks.js';

export function deriveNestedSegwitAddress(publicKey: Uint8Array, network: BitcoinNetwork) {
  const publicKeyHash = hash160(publicKey);
  const redeemScript = concatBytes(Uint8Array.of(0x00, 0x14), publicKeyHash);
  const scriptHash = hash160(redeemScript);
  return {
    address: encodeP2sh(scriptHash, network.p2sh),
    publicKeyHashHex: bytesToHex(publicKeyHash),
    redeemScriptHex: bytesToHex(redeemScript),
    scriptHashHex: bytesToHex(scriptHash),
    scriptPubKeyHex: `a914${bytesToHex(scriptHash)}87`,
  };
}
