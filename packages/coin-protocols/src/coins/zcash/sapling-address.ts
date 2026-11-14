// The text of a Sapling payment address on mainnet, zs1…: Bech32 under the HRP "zs" of the raw
// address d ‖ pk_d ("Sapling Payment Addresses"), without BIP-173's 90-character limit (ZIP-173).
// The rows write it and the Wallet Matcher reads it, without the derivation runtime.
import { bech32 } from "@scure/base";
import { isSaplingAddressEncoding, SAPLING_ADDRESS_BYTES } from "../../zip32-sapling.js";
import type { PointChecks } from "./unified.js";

export { isSaplingAddressEncoding };

/** The HRP of a Sapling payment address on mainnet. */
const HRP = "zs";

/** The zs1… text of a raw Sapling payment address, in lowercase. */
export function saplingAddressText(raw: Uint8Array): string {
  return bech32.encode(HRP, bech32.toWords(raw), false);
}

/**
 * The raw payment address d ‖ pk_d that `text` holds: undefined when `text` is not Bech32 with a
 * valid checksum under the HRP "zs" in one case (BIP-173 refuses mixed case, and @scure/base with
 * it); "malformed" when its bytes are no Sapling payment address (isSaplingAddressEncoding). With
 * `pointChecks` "deferred", only their length (43) is checked, and the caller makes the point
 * checks, a few milliseconds each, when it can afford them.
 */
export function readSaplingAddress(
  text: string,
  pointChecks: PointChecks = "made",
): Uint8Array | "malformed" | undefined {
  if (!text.toLowerCase().startsWith(`${HRP}1`)) return undefined;
  let decoded: { readonly prefix: string; readonly bytes: Uint8Array };
  try {
    // Bech32's own 90-character limit bounds the work: a Sapling address has 78 characters.
    decoded = bech32.decodeToBytes(text);
  } catch {
    return undefined;
  }
  if (decoded.prefix !== HRP) return undefined;
  const valid =
    pointChecks === "deferred"
      ? decoded.bytes.length === SAPLING_ADDRESS_BYTES
      : isSaplingAddressEncoding(decoded.bytes);
  return valid ? decoded.bytes : "malformed";
}
