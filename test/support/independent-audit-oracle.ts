import { createHash, pbkdf2Sync } from 'node:crypto';
import { HDNodeWallet, SigningKey } from 'ethers';

export const AUDIT_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

export function referenceSeed(passphrase = '', mnemonic = AUDIT_MNEMONIC): Buffer {
  return pbkdf2Sync(mnemonic.normalize('NFKD'), `mnemonic${passphrase.normalize('NFKD')}`, 2048, 64, 'sha512');
}

export function digest(algorithm: string, bytes: Uint8Array): Buffer {
  return createHash(algorithm).update(bytes).digest();
}

export function referencePublicKey(seed: Uint8Array, path: string): string {
  return HDNodeWallet.fromSeed(seed).derivePath(path).publicKey.slice(2);
}

export function referenceBase58Check(payload: Uint8Array): string {
  const bytes = Buffer.concat([payload, digest('sha256', digest('sha256', payload)).subarray(0, 4)]);
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let number = BigInt(`0x${bytes.toString('hex')}`);
  let encoded = '';
  while (number > 0n) {
    encoded = alphabet[Number(number % 58n)]! + encoded;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = '1' + encoded;
  }
  return encoded;
}

export function referenceP2pkh(publicKey: string, version = 0): string {
  const keyHash = digest('ripemd160', digest('sha256', Buffer.from(publicKey, 'hex')));
  return referenceBase58Check(Buffer.concat([Buffer.from([version]), keyHash]));
}

// Independent BIP350 encoder: no application/scure encoding or hashing helpers.
export function referenceBech32m(hrp: string, version: number, bytes: Uint8Array): string {
  const words = [version];
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = ((accumulator << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((accumulator >>> bits) & 31);
    }
  }
  if (bits) words.push((accumulator << (5 - bits)) & 31);
  const expanded = [...hrp].map(char => char.charCodeAt(0) >>> 5)
    .concat(0, [...hrp].map(char => char.charCodeAt(0) & 31));
  let checksum = 1;
  for (const word of [...expanded, ...words, 0, 0, 0, 0, 0, 0]) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ word;
    [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3].forEach((generator, index) => {
      if ((top >>> index) & 1) checksum ^= generator;
    });
  }
  checksum ^= 0x2bc830a3;
  const alphabet = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const check = Array.from({ length: 6 }, (_, index) => (checksum >>> (5 * (5 - index))) & 31);
  return `${hrp}1${[...words, ...check].map(word => alphabet[word]).join('')}`;
}

export function referenceTaggedHash(tag: string, bytes: Uint8Array): Buffer {
  const hashedTag = digest('sha256', Buffer.from(tag));
  return digest('sha256', Buffer.concat([hashedTag, hashedTag, bytes]));
}

export function referenceLabeledSpend(scanPrivate: string, spendPublic: string, label: number): string {
  const serialized = Buffer.alloc(4);
  serialized.writeUInt32BE(label);
  const tweak = referenceTaggedHash('BIP0352/Label', Buffer.concat([Buffer.from(scanPrivate, 'hex'), serialized]));
  return SigningKey.addPoints(`0x${spendPublic}`, SigningKey.computePublicKey(tweak, true), true).slice(2);
}
