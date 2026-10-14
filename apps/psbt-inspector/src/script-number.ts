// Script numbers (CScriptNum): a little-endian magnitude whose last byte carries the sign in its top
// bit. One decoder for the asm view, the Miniscript comparison and the lock operands.
import { hexToBytes } from "@ckd/core/crypto.js";

/** The longest operand of an arithmetic opcode: 4 bytes (Bitcoin Core, nDefaultMaxNumSize). */
export const SCRIPT_NUMBER_BYTES = 4;
/** The longest operand of CHECKLOCKTIMEVERIFY and CHECKSEQUENCEVERIFY: 5 bytes (BIP65, BIP112). */
export const LOCK_NUMBER_BYTES = 5;

/**
 * The number that the pushed `hex` holds, read as a script number of at most `maxBytes` bytes;
 * An empty push is zero; null for odd hex or an operand beyond the opcode's size limit.
 */
export function scriptNumberOf(hex: string, maxBytes = SCRIPT_NUMBER_BYTES): number | null {
  if (hex.length === 0) return 0;
  if (hex.length % 2 !== 0 || hex.length > 2 * maxBytes) return null;
  const bytes = hexToBytes(hex);
  let value = 0;
  for (let index = 0; index < bytes.length; index += 1)
    value += (bytes[index]! & (index === bytes.length - 1 ? 0x7f : 0xff)) * 2 ** (8 * index);
  return (bytes.at(-1)! & 0x80) === 0 ? value : -value;
}
