import { MINIMAL_BYTEWORDS } from "../../../packages/recovery-mnemocode/source/sskr/bytewords-list.js";
import { CRC32_BYTES, crc32 } from "../../../packages/recovery-mnemocode/source/sskr/checksum.js";

/** Transport for small public audit fixtures, not a cryptographic oracle or product codec. */
export class SyntheticUr {
  static encode(type: string, payload: Uint8Array): string {
    const transport = new Uint8Array(payload.length + CRC32_BYTES);
    transport.set(payload);
    new DataView(transport.buffer).setUint32(payload.length, crc32(payload));
    return `ur:${type}/${Array.from(transport, (byte) => MINIMAL_BYTEWORDS[byte]!).join("")}`;
  }
}
