import { HDKey, HARDENED_OFFSET, type Versions } from '@scure/bip32';
import { bytesToHex, hexToBytes, secp256k1 } from '@ckd/core/crypto.js';
import type { PsbtNetwork } from './psbt.js';

const MAINNET_VERSIONS: Versions = { private: 0x0488ade4, public: 0x0488b21e };
const TESTNET_VERSIONS: Versions = { private: 0x04358394, public: 0x043587cf };

export function isRangedDescriptorKey(value: string): boolean {
  return /(?:^|\])[xt]pub[1-9A-HJ-NP-Za-km-z]+/u.test(value.trim());
}

export function validateDescriptorPublicKey(
  value: string,
  network: PsbtNetwork,
  options: { readonly allowXOnly?: boolean; readonly wildcardIndex?: number } = {},
): void {
  const normalized = value.trim().replaceAll('\\*', '*');
  const originMatch = /^\[([^\]]+)\](.+)$/u.exec(normalized);
  const origin = originMatch?.[1];
  const key = originMatch?.[2] ?? normalized;
  validateOrigin(normalized);
  if (origin !== undefined && !/^[0-9a-fA-F]{8}(?:\/(?:0|[1-9][0-9]*)['hH]?)*$/u.test(origin)) {
    throw new Error('Invalid public key origin: expected an 8-hex fingerprint followed by numeric BIP32 path steps.');
  }
  if (/^(02|03)[0-9a-fA-F]{64}$/u.test(key) || /^04[0-9a-fA-F]{128}$/u.test(key)) {
    try {
      secp256k1.Point.fromBytes(hexToBytes(key));
      return;
    } catch (cause) {
      throw new Error(`Invalid public key: the encoded secp256k1 point is not valid (${String(cause)}).`);
    }
  }
  if (options.allowXOnly === true && /^[0-9a-fA-F]{64}$/u.test(key)) {
    try {
      secp256k1.Point.fromBytes(hexToBytes(`02${key}`));
      return;
    } catch (cause) {
      throw new Error(`Invalid public key: the x-only secp256k1 point is not valid (${String(cause)}).`);
    }
  }
  if (/^[xt]pub/u.test(key)) {
    try {
      materializeDescriptorKey(normalized, network, 0, options.wildcardIndex ?? 0);
      return;
    } catch (cause) {
      throw new Error(`Invalid xpub: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  throw new Error(`Invalid public key: expected a valid ${options.allowXOnly === true ? 'x-only or compressed ' : ''}secp256k1 public key or xpub/tpub descriptor key.`);
}

export function materializeDescriptorKey(
  value: string,
  network: PsbtNetwork,
  multipathChoice: 0 | 1,
  wildcardIndex: number,
): string {
  const normalized = value.trim().replaceAll('\\*', '*');
  validateOrigin(normalized);
  const barePublicKey = /^(?:\[[^\]]+\])?((?:(?:02|03)[0-9a-fA-F]{64}|04[0-9a-fA-F]{128}))$/u.exec(normalized)?.[1];
  if (barePublicKey !== undefined) {
    secp256k1.Point.fromBytes(hexToBytes(barePublicKey));
    return barePublicKey.toLowerCase();
  }
  if (!Number.isSafeInteger(wildcardIndex) || wildcardIndex < 0 || wildcardIndex >= HARDENED_OFFSET) {
    throw new Error('Descriptor wildcard index must be an unhardened BIP32 child number.');
  }
  const match = /^(?:\[([0-9a-fA-F]{8}(?:\/[0-9]+['hH]?)*)\])?([xt]pub[1-9A-HJ-NP-Za-km-z]+)((?:\/(?:\d+|<\d+;\d+>|\*))*)$/u.exec(normalized);
  if (match === null) throw new Error('Staged recovery keys must be compressed public keys or public extended keys with numeric, multipath, and wildcard suffixes.');
  const xpub = match[2]!;
  const expectedPrefix = network === 'mainnet' ? 'xpub' : 'tpub';
  if (!xpub.startsWith(expectedPrefix)) throw new Error(`The selected ${network} network requires ${expectedPrefix} descriptor keys.`);
  const suffix = match[3]!;
  const segments = suffix.length === 0 ? [] : suffix.slice(1).split('/');
  if (segments.filter(segment => segment.startsWith('<')).length > 1) throw new Error('A BIP389 key may contain only one multipath tuple.');
  if (segments.some(segment => /^<(\d+);\1>$/u.test(segment))) throw new Error('Multipath branches must be distinct.');
  const wildcardPosition = segments.indexOf('*');
  if (wildcardPosition !== -1 && wildcardPosition !== segments.length - 1) throw new Error('A descriptor wildcard must be the final derivation step.');
  if (segments.filter((segment) => segment === '*').length > 1) throw new Error('A descriptor key may contain only one wildcard.');
  const indexes = segments.map((segment) => {
    if (segment === '*') return wildcardIndex;
    const multipath = /^<(\d+);(\d+)>$/u.exec(segment);
    if (multipath !== null && multipath.slice(1).some(value => !Number.isSafeInteger(Number(value)) || Number(value) >= HARDENED_OFFSET)) throw new Error('Multipath child exceeds the unhardened BIP32 range.');
    const selected = multipath === null ? segment : multipath[multipathChoice + 1]!;
    const index = Number(selected);
    if (!Number.isSafeInteger(index) || index < 0 || index >= HARDENED_OFFSET) throw new Error(`Descriptor child step ${selected} is outside the unhardened BIP32 range.`);
    return index;
  });
  let node = HDKey.fromExtendedKey(xpub, network === 'mainnet' ? MAINNET_VERSIONS : TESTNET_VERSIONS);
  for (const index of indexes) node = node.deriveChild(index);
  if (node.publicKey === null) throw new Error('Descriptor key derivation did not produce a public key.');
  return bytesToHex(node.publicKey);
}

function validateOrigin(value: string): void {
  const origin = /^\[([^\]]+)\]/u.exec(value)?.[1];
  if (origin === undefined) return;
  if (!/^[0-9a-fA-F]{8}(?:\/(?:0|[1-9][0-9]*)['hH]?)*$/u.test(origin)) throw new Error('Invalid descriptor origin.');
  for (const step of origin.split('/').slice(1)) {
    const index = Number(step.replace(/['hH]$/u, ''));
    if (!Number.isSafeInteger(index) || index >= HARDENED_OFFSET) throw new Error('Descriptor origin step is outside the BIP32 range.');
  }
}
