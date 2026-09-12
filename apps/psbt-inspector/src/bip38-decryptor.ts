import { decryptBip38 } from '@ckd/core/bip38.js';
import { bytesToHex, concatBytes, encodeBase58Check, wipe } from '@ckd/core/crypto.js';
import { getBitcoinNetwork, getDashNetwork } from '@ckd/core/networks.js';
import type { PsbtChain } from './psbt.js';

export interface Bip38Decryption {
  readonly address: string;
  readonly privateKeyHex: string;
  readonly wif: string;
  readonly compressed: boolean;
}

export async function decryptBip38Key(
  encryptedKey: string,
  passphrase: string,
  chain: PsbtChain,
  networkName: 'mainnet' | 'testnet',
): Promise<Bip38Decryption> {
  if (!encryptedKey.trim().startsWith('6P')) {
    throw new Error('Enter a BIP38 encrypted private key beginning with 6P, not its public address.');
  }
  const network = chain === 'dash' ? getDashNetwork(networkName) : getBitcoinNetwork(networkName);
  const decrypted = await decryptBip38(encryptedKey, passphrase, network);
  try {
    const payload = decrypted.compressed
      ? concatBytes(Uint8Array.of(network.wif), decrypted.privateKey, Uint8Array.of(1))
      : concatBytes(Uint8Array.of(network.wif), decrypted.privateKey);
    try {
      return {
        address: decrypted.address,
        privateKeyHex: bytesToHex(decrypted.privateKey),
        wif: encodeBase58Check(payload),
        compressed: decrypted.compressed,
      };
    } finally {
      wipe(payload);
    }
  } finally {
    wipe(decrypted.privateKey);
  }
}
