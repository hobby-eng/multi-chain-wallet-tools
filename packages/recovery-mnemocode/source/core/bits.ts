/** Bit order is most significant bit first, matching BIP39 entropy serialization. */

const BITS_PER_BYTE = 8;

export function modulo(value: number, divisor: number): number {
  const remainder = value % divisor;
  return remainder < 0 ? remainder + divisor : remainder;
}

export function bytesToBits(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(2).padStart(BITS_PER_BYTE, '0')).join('');
}

export function bitsToBytes(bits: string): Uint8Array {
  if (bits.length % BITS_PER_BYTE !== 0 || !/^[01]+$/u.test(bits))
    throw new Error('Entropy must contain a whole number of bytes.');
  return Uint8Array.from({ length: bits.length / BITS_PER_BYTE }, (_, index) =>
    Number.parseInt(bits.slice(index * BITS_PER_BYTE, index * BITS_PER_BYTE + BITS_PER_BYTE), 2),
  );
}
