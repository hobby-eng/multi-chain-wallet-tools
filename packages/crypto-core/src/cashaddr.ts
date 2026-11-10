// CashAddr, the address format of Bitcoin Cash (specification 1.0 of 2017-10-13,
// https://github.com/bitcoincashorg/bitcoincash.org/blob/master/spec/cashaddr.md): a prefix, a
// colon and the base32 payload of a version byte and a hash, closed by a 40-bit BCH checksum over
// GF(2^5) that also covers the prefix.
import { bech32 } from "@scure/base";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
/** The checksum's generators, as the specification's PolyMod gives them. */
const GENERATORS = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
const LOW_35_BITS = 0x07ffffffffn;

/** The type bits of a P2KH address (pay to a key hash), shifted into the version byte. */
export const CASHADDR_P2KH = 0;
/** The type bits of a P2SH address (pay to a script hash), shifted into the version byte. */
export const CASHADDR_P2SH = 8;
/** One of the two CashAddr types. */
export type CashAddrType = typeof CASHADDR_P2KH | typeof CASHADDR_P2SH;

/** The specification's PolyMod over 5-bit values. */
function polymod(values: readonly number[]): bigint {
  let c = 1n;
  for (const value of values) {
    const top = c >> 35n;
    c = ((c & LOW_35_BITS) << 5n) ^ BigInt(value);
    GENERATORS.forEach((generator, bit) => {
      if (((top >> BigInt(bit)) & 1n) === 1n) c ^= generator;
    });
  }
  return c ^ 1n;
}

/**
 * The CashAddr of a 160-bit `hash` (a HASH160) under the lowercase `prefix`, such as
 * "bitcoincash". The size bits of the version byte are 0, for 160 bits.
 */
export function encodeCashAddr(prefix: string, type: CashAddrType, hash: Uint8Array): string {
  const payload = bech32.toWords(Uint8Array.of(type, ...hash));
  const prefixValues = [...prefix].map((character) => character.charCodeAt(0) & 0x1f);
  const checksum = polymod([...prefixValues, 0, ...payload, 0, 0, 0, 0, 0, 0, 0, 0]);
  const checksumValues = Array.from({ length: 8 }, (_, group) =>
    Number((checksum >> BigInt(5 * (7 - group))) & 0x1fn),
  );
  return `${prefix}:${[...payload, ...checksumValues].map((value) => CHARSET[value]).join("")}`;
}

/**
 * The type and hash of a 160-bit CashAddr under `prefix`, written with or without the prefix, in
 * one case; null when it is not one, its checksum fails or its version byte is another.
 */
export function decodeCashAddr(
  text: string,
  prefix: string,
): { readonly type: number; readonly hash: Uint8Array } | null {
  if (text !== text.toLowerCase() && text !== text.toUpperCase()) return null;
  const lower = text.toLowerCase();
  const body = lower.startsWith(`${prefix}:`) ? lower.slice(prefix.length + 1) : lower;
  if (body.length !== 42 || body.includes(":")) return null;
  const values = [...body].map((character) => CHARSET.indexOf(character));
  if (values.some((value) => value < 0)) return null;
  const prefixValues = [...prefix].map((character) => character.charCodeAt(0) & 0x1f);
  if (polymod([...prefixValues, 0, ...values]) !== 0n) return null;
  let bytes: Uint8Array;
  try {
    bytes = bech32.fromWords(values.slice(0, -8));
  } catch {
    return null;
  }
  const [type = -1, ...hash] = bytes;
  if (bytes.length !== 21 || (type !== CASHADDR_P2KH && type !== CASHADDR_P2SH)) return null;
  return { type, hash: Uint8Array.from(hash) };
}
