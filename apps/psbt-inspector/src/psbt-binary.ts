import { bytesToHex } from '@ckd/core/crypto.js';

const MAX_COLLECTION_SIZE = 10_000;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
export const MAX_PSBT_BYTES = 16 * 1024 * 1024;

export interface PsbtPair {
  readonly type: bigint;
  readonly keyData: Uint8Array;
  readonly value: Uint8Array;
}

export class Reader {
  offset = 0;

  constructor(readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  peek(relative = 0): number | undefined {
    return this.bytes[this.offset + relative];
  }

  read(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new Error('Unexpected end of PSBT data.');
    }
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  u8(): number {
    return this.read(1)[0] ?? 0;
  }

  u16(): number {
    const value = this.read(2);
    return (value[0] ?? 0) | ((value[1] ?? 0) << 8);
  }

  u32(): number {
    const value = this.read(4);
    return ((value[0] ?? 0) | ((value[1] ?? 0) << 8) | ((value[2] ?? 0) << 16) | ((value[3] ?? 0) << 24)) >>> 0;
  }

  u64(): bigint {
    const value = this.read(8);
    let result = 0n;
    for (let index = 7; index >= 0; index -= 1) result = (result << 8n) | BigInt(value[index] ?? 0);
    return result;
  }

  compact(): bigint {
    const prefix = this.u8();
    if (prefix < 0xfd) return BigInt(prefix);
    if (prefix === 0xfd) {
      const value = BigInt(this.u16());
      if (value < 0xfdn) throw new Error('Non-minimal CompactSize integer.');
      return value;
    }
    if (prefix === 0xfe) {
      const value = BigInt(this.u32());
      if (value <= 0xffffn) throw new Error('Non-minimal CompactSize integer.');
      return value;
    }
    const value = this.u64();
    if (value <= 0xffffffffn) throw new Error('Non-minimal CompactSize integer.');
    return value;
  }

  compactNumber(label: string, maximum = MAX_COLLECTION_SIZE): number {
    const value = this.compact();
    if (value > MAX_SAFE_BIGINT || value > BigInt(maximum)) throw new Error(`${label} is unreasonably large.`);
    return Number(value);
  }

  varBytes(label: string, maximum = this.remaining): Uint8Array {
    return this.read(this.compactNumber(label, maximum));
  }
}

export function reverseHex(bytes: Uint8Array): string {
  return bytesToHex(bytes.slice().reverse());
}

export function decodeText(value: string): Uint8Array {
  const normalized = value.trim().replaceAll(/\s+/gu, '');
  if (normalized.length === 0) throw new Error('Paste a PSBT as Base64 or hexadecimal bytes.');
  if (/^[0-9a-f]+$/iu.test(normalized) && normalized.length % 2 === 0) {
    if (normalized.length / 2 > MAX_PSBT_BYTES) throw new Error('PSBT input exceeds the 16 MiB decoded size ceiling.');
    const bytes = new Uint8Array(normalized.length / 2);
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
    return bytes;
  }
  try {
    if (normalized.length > 4 * Math.ceil(MAX_PSBT_BYTES / 3)) {
      throw new Error('PSBT input exceeds the 16 MiB decoded size ceiling.');
    }
    const decoded = atob(normalized);
    if (decoded.length > MAX_PSBT_BYTES) throw new Error('PSBT input exceeds the 16 MiB decoded size ceiling.');
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('16 MiB')) throw cause;
    throw new Error('The input is neither valid Base64 nor hexadecimal data.');
  }
}

function decodeType(key: Uint8Array): { type: bigint; keyData: Uint8Array } {
  const reader = new Reader(key);
  const type = reader.compact();
  return { type, keyData: reader.read(reader.remaining) };
}

export function readMap(reader: Reader): PsbtPair[] {
  const pairs: PsbtPair[] = [];
  const keys = new Set<string>();
  while (true) {
    const keyLength = reader.compactNumber('PSBT key length', reader.remaining);
    if (keyLength === 0) return pairs;
    const rawKey = reader.read(keyLength);
    const keyHex = bytesToHex(rawKey);
    if (keys.has(keyHex)) throw new Error(`Duplicate PSBT key ${keyHex}.`);
    keys.add(keyHex);
    const { type, keyData } = decodeType(rawKey);
    const value = reader.varBytes('PSBT value length', reader.remaining);
    if (pairs.length >= MAX_COLLECTION_SIZE) throw new Error('Too many PSBT map entries.');
    pairs.push({ type, keyData, value });
  }
}

export function pair(map: readonly PsbtPair[], type: number): PsbtPair | undefined {
  return map.find((item) => item.type === BigInt(type) && item.keyData.length === 0);
}

export function littleU32(value: Uint8Array, label: string): number {
  if (value.length !== 4) throw new Error(`${label} must contain four bytes.`);
  return new Reader(value).u32();
}

export function compactValue(value: Uint8Array, label: string): number {
  const reader = new Reader(value);
  const result = reader.compactNumber(label);
  if (reader.remaining !== 0) throw new Error(`${label} contains trailing data.`);
  return result;
}
