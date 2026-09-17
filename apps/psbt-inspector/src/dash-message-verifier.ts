import { concatBytes, encodeBase58Check, hash160 } from '@ckd/core/crypto.js';
import {
  compactMessageDigest,
  decodeCompactSignature,
  recoverCompactPublicKey,
} from '@ckd/core/compact-message-internal.js';
import type { PsbtNetwork } from './psbt.js';

export interface MessageVerification {
  readonly valid: boolean;
  readonly format: string;
  readonly recoveredAddress: string | null;
  readonly recoveredPublicKey: string | null;
  readonly messageMagic: string;
  readonly timeConstraints: string;
}

function dashAddress(publicKey: Uint8Array, network: PsbtNetwork): string {
  return encodeBase58Check(concatBytes(Uint8Array.of(network === 'mainnet' ? 0x4c : 0x8c), hash160(publicKey)));
}

function hexadecimal(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function verifyDashSignedMessage(
  address: string,
  message: string,
  signatureBase64: string,
  network: PsbtNetwork,
): Promise<MessageVerification> {
  if (signatureBase64.trim().length === 0) throw new Error('Enter a Base64 compact signature.');
  let signature: Uint8Array;
  try {
    signature = decodeCompactSignature(signatureBase64);
  } catch {
    throw new Error('The signature is not valid Base64.');
  }
  if (signature.length !== 65) throw new Error('A compact message signature must decode to exactly 65 bytes.');
  const header = signature[0]!;
  if (header < 27 || header > 34) throw new Error('Dash compact signature header must be from 27 to 34.');
  const digest = compactMessageDigest(message, 'DarkCoin Signed Message:\n');
  try {
    let recovered: ReturnType<typeof recoverCompactPublicKey>;
    try {
      recovered = recoverCompactPublicKey(signature, digest);
    } catch {
      throw new Error(
        'The compact signature contains invalid ECDSA values or a recovery identifier that cannot recover a key.',
      );
    }
    const recoveredAddress = dashAddress(recovered.publicKey, network);
    return {
      valid: recoveredAddress === address.trim(),
      format: `Dash Core compact P2PKH · ${recovered.compressed ? 'compressed' : 'uncompressed'} key`,
      recoveredAddress,
      recoveredPublicKey: hexadecimal(recovered.publicKey),
      messageMagic: 'Dash Core signed-message domain',
      timeConstraints: 'Not applicable',
    };
  } finally {
    signature.fill(0);
    digest.fill(0);
  }
}
