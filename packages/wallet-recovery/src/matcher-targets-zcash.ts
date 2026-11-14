import { ZCASH_ADDRESS, ZCASH_SAPLING_PROFILE } from "@ckd/coins/zcash/profiles.js";
import {
  isSaplingAddressEncoding,
  readSaplingAddress,
  saplingAddressText,
} from "@ckd/coins/zcash/sapling-address.js";
import { decodeUnified, type DecodedUnified } from "@ckd/coins/zcash/unified.js";
import { base58Hash } from "@ckd/core/crypto.js";
import {
  UnsearchableAddressError,
  type MatcherCoin,
  type RecognizedTarget,
} from "./matcher-targets.js";

/**
 * Zcash's part of the Wallet Matcher, mainnet only. A transparent t1… address is searched under the
 * transparent variant. A Sapling address (zs1…), and the Sapling receiver of a unified address
 * (u1…, ZIP-316 Revision 0) whatever other receivers it holds, are searched under the Sapling
 * variant as that zs1 text: first among the rows of the index range, then by the ownership test of
 * each searched account's keys (WalletMatcherTarget.ownership), which finds it at any diversifier
 * index up to 2^31 − 1, the rows' own bound. Only the Sapling receiver of a unified address is
 * compared; its transparent or other receivers are not. A unified address without a Sapling
 * receiver, such as one of an Orchard receiver alone, is refused: Orchard is not derived here. A
 * unified address that ZIP-316 makes a consumer refuse is refused with the decoder's reason, and a
 * zs1 text whose bytes are no Sapling address as malformed. The receiver's point checks cost a few
 * milliseconds each, so recognition reads only its form and leaves them to the plan's turns
 * (WalletMatcherTarget.check). Testnet texts are not recognized.
 */
const TRANSPARENT = ["zcash"];
const SAPLING = [ZCASH_SAPLING_PROFILE.adapterId];
/** The HRP of a unified address on mainnet, and the decoder's codes of a text that is none. */
const UNIFIED_PREFIX = "u1";
const NOT_UNIFIED: readonly string[] = ["zcash.unified.bech32m", "zcash.unified.prefix"];

/** The refusal of a zs1 text, or a unified address's Sapling receiver, that is no address. */
const MALFORMED =
  "a malformed Sapling address: its bytes are no diversifier and transmission key of an address.";

/** Refuses the raw Sapling receiver `raw` when it is no payment address (its point checks). */
function checkSaplingReceiver(raw: Uint8Array): void {
  if (!isSaplingAddressEncoding(raw)) throw new UnsearchableAddressError(MALFORMED);
}

/**
 * The target that the raw Sapling receiver `raw` (of the right length; a copy the target keeps)
 * gives the line `value`, its point checks left to the plan.
 */
function saplingTarget(value: string, raw: Uint8Array): RecognizedTarget {
  const receiver = raw.slice();
  return {
    input: value,
    network: "mainnet",
    normalized: saplingAddressText(receiver),
    adapterIds: SAPLING,
    ownership: true,
    check: () => checkSaplingReceiver(receiver),
  };
}

/** The unified address `value` decoded, or null when it is no mainnet unified address. */
function decodedUnified(value: string): DecodedUnified | null {
  try {
    return decodeUnified("address", value, "deferred");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (typeof code === "string" && NOT_UNIFIED.includes(code)) return null;
    // The decoder's own refusals say which rule of ZIP-316 the text breaks, and quote none of it.
    if (typeof code !== "string" || !code.startsWith("zcash.unified.")) throw error;
    throw new UnsearchableAddressError(error instanceof Error ? error.message : code);
  }
}

/** The target of the unified address `value`: its Sapling receiver's. */
function unifiedTarget(value: string): RecognizedTarget | null {
  const decoded = decodedUnified(value);
  if (decoded === null) return null;
  try {
    // The decoder admits only an address with a shielded receiver: without Sapling's, Orchard's.
    if (decoded.sapling === undefined)
      throw new UnsearchableAddressError(
        "a unified address with an Orchard receiver and no Sapling receiver, which cannot be searched: Orchard keys are not derived here.",
      );
    return saplingTarget(value, decoded.sapling);
  } finally {
    decoded.wipe();
  }
}

export const ZCASH_MATCHER: MatcherCoin = {
  recognize: (value, network) => {
    if (network !== "mainnet") return null;
    if (base58Hash(value, ZCASH_ADDRESS.t1) !== null)
      return { input: value, network, normalized: value, adapterIds: TRANSPARENT };
    const sapling = readSaplingAddress(value, "deferred");
    if (sapling === "malformed") throw new UnsearchableAddressError(MALFORMED);
    if (sapling instanceof Uint8Array) return saplingTarget(value, sapling);
    return value.toLowerCase().startsWith(UNIFIED_PREFIX) ? unifiedTarget(value) : null;
  },
  addressAdapters: TRANSPARENT,
};
