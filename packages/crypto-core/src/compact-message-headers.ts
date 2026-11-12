// The header byte of a compact message signature: 27 + recovery id for an uncompressed key, 31 +
// recovery id for a compressed one (Bitcoin Core), and BIP137's typed headers for SegWit keys,
// 35 + recovery id for P2SH-P2WPKH and 39 + recovery id for P2WPKH. Each coin's format reads only
// the headers its wallets write.

/** The script type a signature proves: BIP137 names it in headers 35–42, Core's 27–34 do not. */
export type CompactScriptType = "p2pkh" | "p2sh-p2wpkh" | "p2wpkh";

/**
 * The headers a format reads: Bitcoin Core's 27–34; BIP137's 27–42, whose untyped 31–34 prove any
 * single-key type as Electrum-LTC reads them; or compressed keys only, 31–34, as Zallet reads them.
 */
export type CompactHeaders = "core" | "bip137" | "compressed";

/** What a header says: the recovery id, the key's form, and the script types it may prove. */
export interface CompactHeader {
  readonly recoveryId: number;
  readonly compressed: boolean;
  readonly types: readonly CompactScriptType[];
}

/** The first header of each range: uncompressed, compressed, and BIP137's nested and native. */
const UNCOMPRESSED = 27;
const COMPRESSED = 31;
const NESTED = 35;
const NATIVE = 39;
/** The last BIP137 header: 39 + recovery id 3. */
const LAST = 42;

const SIGNING_BASE: Readonly<Record<CompactScriptType, number>> = Object.freeze({
  p2pkh: COMPRESSED,
  "p2sh-p2wpkh": NESTED,
  p2wpkh: NATIVE,
});
const ANY_TYPE: readonly CompactScriptType[] = Object.freeze(["p2pkh", "p2sh-p2wpkh", "p2wpkh"]);
const P2PKH: readonly CompactScriptType[] = Object.freeze(["p2pkh"]);

/** Reads `header` as a format of `headers` reads it; undefined for a header the format does not use. */
export function readCompactHeader(
  header: number,
  headers: CompactHeaders,
): CompactHeader | undefined {
  if (header >= UNCOMPRESSED && header < COMPRESSED)
    return headers === "compressed"
      ? undefined
      : { recoveryId: header - UNCOMPRESSED, compressed: false, types: P2PKH };
  if (header >= COMPRESSED && header < NESTED)
    return {
      recoveryId: header - COMPRESSED,
      compressed: true,
      types: headers === "bip137" ? ANY_TYPE : P2PKH,
    };
  if (headers !== "bip137" || header < NESTED || header > LAST) return undefined;
  return header < NATIVE
    ? { recoveryId: header - NESTED, compressed: true, types: ["p2sh-p2wpkh"] }
    : { recoveryId: header - NATIVE, compressed: true, types: ["p2wpkh"] };
}

/** The header that signs `type` with a compressed key: 31, 35 or 39, plus the recovery id. */
export function compactSigningHeader(recoveryId: number, type: CompactScriptType): number {
  return SIGNING_BASE[type] + recoveryId;
}
