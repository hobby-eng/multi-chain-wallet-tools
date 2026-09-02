import { schnorr } from '@noble/curves/secp256k1.js';
import { bech32m } from '@scure/base';
import {
  bytesToHex,
  bytesToNumber,
  concatBytes,
  encodeWif,
  numberTo32Bytes,
  secp256k1,
} from '@ckd/core/crypto.js';
import type { BitcoinNetwork } from '@ckd/core/networks.js';

export interface TaprootDetails {
  address: string;
  internalKeyHex: string;
  tapTweakHex: string;
  outputKeyHex: string;
  outputCompressedPublicKeyHex: string;
  outputPrivateKeyHex: string;
  outputPrivateKeyWif: string;
  scriptPubKeyHex: string;
}

/** BIP341 key-path TapTweak with an empty script tree, as used by BIP86. */
export function deriveTaprootDetails(
  childPrivateKey: Uint8Array,
  network: BitcoinNetwork,
): TaprootDetails {
  const childPublicKey = secp256k1.getPublicKey(childPrivateKey, true);
  const internalKey = childPublicKey.slice(1);
  const tweakBytes = schnorr.utils.taggedHash('TapTweak', internalKey);
  const tweak = bytesToNumber(tweakBytes);
  const order = secp256k1.Point.Fn.ORDER;
  if (tweak >= order) throw new Error('Invalid Taproot tweak: value exceeds the curve order.');

  // lift_x always returns the unique even-Y point required by BIP340/BIP341.
  const internalPoint = schnorr.utils.lift_x(bytesToNumber(internalKey));
  const outputPoint = tweak === 0n
    ? internalPoint
    : internalPoint.add(secp256k1.Point.BASE.multiply(tweak));
  const outputKey = numberTo32Bytes(outputPoint.x);

  const childSecret = bytesToNumber(childPrivateKey);
  const normalizedSecret = childPublicKey[0] === 0x03 ? order - childSecret : childSecret;
  const outputSecret = (normalizedSecret + tweak) % order;
  if (outputSecret === 0n) throw new Error('Invalid zero Taproot output private key.');
  const outputPrivateKey = numberTo32Bytes(outputSecret);
  const outputCompressed = concatBytes(
    Uint8Array.of((outputPoint.y & 1n) === 0n ? 0x02 : 0x03),
    outputKey,
  );

  return {
    address: bech32m.encode(network.bech32Hrp, [1, ...bech32m.toWords(outputKey)]),
    internalKeyHex: bytesToHex(internalKey),
    tapTweakHex: bytesToHex(tweakBytes),
    outputKeyHex: bytesToHex(outputKey),
    outputCompressedPublicKeyHex: bytesToHex(outputCompressed),
    outputPrivateKeyHex: bytesToHex(outputPrivateKey),
    outputPrivateKeyWif: encodeWif(outputPrivateKey, network.wif),
    scriptPubKeyHex: `5120${bytesToHex(outputKey)}`,
  };
}
