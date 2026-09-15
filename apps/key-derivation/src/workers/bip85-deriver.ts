import { deriveBip85Bip39, deriveBip85Hex, deriveBip85Wif, deriveBip85Xprv } from '@ckd/core/bip85.js';

export type Bip85Application = 'bip39' | 'wif' | 'xprv' | 'hex';

export interface Bip85RequestOptions {
  application: Bip85Application;
  index: number;
  words?: 12 | 15 | 18 | 21 | 24;
  bytes?: number;
  wifVersion?: number;
}

export interface Bip85Result {
  path: string;
  value: string;
  entropyHex?: string;
  kind: Bip85Application;
}

export function deriveBip85(seed: Uint8Array, options: Bip85RequestOptions): Bip85Result {
  if (options.application === 'bip39') {
    const result = deriveBip85Bip39(seed, options.words ?? 12, options.index);
    return { path: result.path, value: result.entropyHex, entropyHex: result.entropyHex, kind: 'bip39' };
  }
  if (options.application === 'wif') {
    const wifVersion = options.wifVersion ?? 0x80;
    if (!Number.isInteger(wifVersion) || wifVersion < 0 || wifVersion > 0xff) {
      throw new Error('BIP85 WIF version must be one byte.');
    }
    const result = deriveBip85Wif(seed, options.index, wifVersion);
    return { path: result.path, value: result.wif, kind: 'wif' };
  }
  if (options.application === 'xprv') {
    const result = deriveBip85Xprv(seed, options.index);
    return { path: result.path, value: result.xprv, kind: 'xprv' };
  }
  const result = deriveBip85Hex(seed, options.bytes ?? 32, options.index);
  return { path: result.path, value: result.entropyHex, kind: 'hex' };
}
