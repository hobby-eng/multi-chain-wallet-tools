import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { HDKey } from '@scure/bip32';
import { bytesToHex, encodeBase58Check, encodeWif, secp256k1, wipe } from './crypto.js';
import { rootFromSeed } from './bip32.js';

const BIP85_PURPOSE = 83696968;
const XPRV_VERSION = Uint8Array.of(0x04, 0x88, 0xad, 0xe4);
const MAIN_VERSIONS = { private: 0x0488ade4, public: 0x0488b21e } as const;

function assertIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index > 0x7fffffff) {
    throw new Error('BIP85 index must be an integer from 0 to 2147483647.');
  }
}

type Bip85Root = Uint8Array | string;

function entropyAt(source: Bip85Root, path: string): Uint8Array {
  const root = typeof source === 'string'
    ? HDKey.fromExtendedKey(source)
    : rootFromSeed(source, MAIN_VERSIONS);
  const child = root.derive(path);
  const privateKey = child.privateKey;
  try {
    if (privateKey === null) throw new Error(`BIP85 path ${path} did not derive a private key.`);
    return hmac(sha512, new TextEncoder().encode('bip-entropy-from-k'), privateKey);
  } finally {
    child.wipePrivateData();
    root.wipePrivateData();
  }
}

function validScalar(value: Uint8Array, application: string): void {
  if (!secp256k1.utils.isValidSecretKey(value)) {
    throw new Error(`${application} derived an invalid secp256k1 private key; use the next index.`);
  }
}

export function deriveBip85Bip39(
  seed: Bip85Root,
  words: 12 | 15 | 18 | 21 | 24,
  index: number,
): { path: string; entropyHex: string } {
  assertIndex(index);
  const byteLength = words / 3 * 4;
  const path = `m/${BIP85_PURPOSE}'/39'/0'/${words}'/${index}'`;
  const entropy = entropyAt(seed, path);
  const selected = entropy.slice(0, byteLength);
  try {
    return {
      path,
      entropyHex: bytesToHex(selected),
    };
  } finally {
    wipe(entropy, selected);
  }
}

export function deriveBip85Wif(
  seed: Bip85Root,
  index: number,
  wifVersion = 0x80,
): { path: string; wif: string } {
  assertIndex(index);
  if (!Number.isInteger(wifVersion) || wifVersion < 0 || wifVersion > 0xff) {
    throw new Error('WIF version must be one byte.');
  }
  const path = `m/${BIP85_PURPOSE}'/2'/${index}'`;
  const entropy = entropyAt(seed, path);
  const privateKey = entropy.slice(0, 32);
  try {
    validScalar(privateKey, 'BIP85 WIF');
    return { path, wif: encodeWif(privateKey, wifVersion) };
  } finally {
    wipe(entropy, privateKey);
  }
}

export function deriveBip85Xprv(
  seed: Bip85Root,
  index: number,
): { path: string; xprv: string } {
  assertIndex(index);
  const path = `m/${BIP85_PURPOSE}'/32'/${index}'`;
  const entropy = entropyAt(seed, path);
  const privateKey = entropy.slice(32, 64);
  try {
    validScalar(privateKey, 'BIP85 XPRV');
    const payload = new Uint8Array(78);
    payload.set(XPRV_VERSION, 0);
    payload.set(entropy.slice(0, 32), 13);
    payload[45] = 0;
    payload.set(privateKey, 46);
    return { path, xprv: encodeBase58Check(payload) };
  } finally {
    wipe(entropy, privateKey);
  }
}

export function deriveBip85Hex(
  seed: Bip85Root,
  bytes: number,
  index: number,
): { path: string; entropyHex: string } {
  assertIndex(index);
  if (!Number.isSafeInteger(bytes) || bytes < 16 || bytes > 64) {
    throw new Error('BIP85 hexadecimal entropy length must be from 16 to 64 bytes.');
  }
  const path = `m/${BIP85_PURPOSE}'/128169'/${bytes}'/${index}'`;
  const entropy = entropyAt(seed, path);
  try {
    return { path, entropyHex: bytesToHex(entropy.slice(0, bytes)) };
  } finally {
    wipe(entropy);
  }
}
