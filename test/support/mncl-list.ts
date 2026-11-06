// A writer of MnemoCode candidate lists (MNCL, MnemoCode docs/CANDIDATES.md) for tests, which make
// lists of public test phrases; the pages only read lists, with MnemoCode's own WebAssembly.
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export interface MnclRecord {
  readonly phrase: string;
  readonly passphrase?: string;
}

/** CRC-32 of zlib and PNG. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Padmé's padded length of `length` bytes. */
export function padme(length: number): number {
  if (length < 2) return length;
  const e = Math.floor(Math.log2(length));
  const s = Math.floor(Math.log2(e)) + 1;
  const mask = 2 ** (e - s) - 1;
  return Math.floor((length + mask) / (mask + 1)) * (mask + 1);
}

/** The MNCL bytes of `records`, with `passphrase` for all of them if given. */
export function mnclList(records: readonly MnclRecord[], passphrase?: string): Uint8Array {
  const text = new TextEncoder();
  const ownPassphrases = records.some((record) => record.passphrase !== undefined);
  const entropies = records.map((record) => mnemonicToEntropy(record.phrase, wordlist));
  const field = (value: string): number[] => {
    const bytes = text.encode(value);
    return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
  };
  const count = records.length;
  const body = [
    ...text.encode("MNCL"),
    1,
    (passphrase === undefined ? 0 : 1) | (ownPassphrases ? 2 : 0),
    entropies[0]!.length,
    (count >>> 24) & 0xff,
    (count >>> 16) & 0xff,
    (count >>> 8) & 0xff,
    count & 0xff,
    ...(passphrase === undefined ? [] : field(passphrase)),
    ...records.flatMap((record, at) => [
      ...entropies[at]!,
      ...(ownPassphrases ? field(record.passphrase ?? "") : []),
    ]),
  ];
  const crc = crc32(Uint8Array.from(body));
  const unpadded = [...body, crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff];
  const list = new Uint8Array(padme(unpadded.length));
  list.set(unpadded);
  return list;
}
