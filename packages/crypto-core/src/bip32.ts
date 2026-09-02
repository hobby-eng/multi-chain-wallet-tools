import { HDKey, HARDENED_OFFSET } from '@scure/bip32';
import type { Bip32Versions } from './networks.js';

export const MAX_BIP32_INDEX = HARDENED_OFFSET - 1;
export const MAX_BATCH_SIZE = 50;

export function assertIndex(value: number, name: string, max = MAX_BIP32_INDEX): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} must be an integer from 0 to ${max}.`);
  }
  return value;
}

export function assertBatch(start: number, count: number): void {
  assertIndex(start, 'Start index');
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_BATCH_SIZE) {
    throw new Error(`Number of results must be an integer from 1 to ${MAX_BATCH_SIZE}.`);
  }
  if (start + count - 1 > MAX_BIP32_INDEX) {
    throw new Error('The requested index range exceeds the valid non-hardened range.');
  }
}

export function rootFromSeed(seed: Uint8Array, versions: Bip32Versions): HDKey {
  return HDKey.fromMasterSeed(seed, versions);
}

export function requirePrivate(node: HDKey, path: string): Uint8Array {
  const key = node.privateKey;
  if (key === null) throw new Error(`No private key was derived at ${path}.`);
  return key;
}

export function requirePublic(node: HDKey, path: string): Uint8Array {
  const key = node.publicKey;
  if (key === null) throw new Error(`No public key was derived at ${path}.`);
  return key;
}
