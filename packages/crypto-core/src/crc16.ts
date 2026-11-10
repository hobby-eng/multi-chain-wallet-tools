// CRC-16/XMODEM: polynomial x^16 + x^12 + x^5 + 1 (0x1021), initial value 0, no reflection, no
// final XOR. Stellar's StrKey (SEP-0023) and TON's user-friendly addresses close their bytes with it.

const POLYNOMIAL = 0x1021;

/** The CRC-16/XMODEM of `bytes`, as a number below 2^16. */
export function crc16Xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ POLYNOMIAL) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}
