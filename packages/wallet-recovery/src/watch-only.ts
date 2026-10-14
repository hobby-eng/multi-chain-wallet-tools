import { WatchOnlyDepthPolicy } from "./watch-only/dash-profile.js";
import { nonEmptyLines } from "@ckd/core/text-lines.js";
import { SEC1_KEY_HEX, normalizedHex } from "@ckd/core/key-text.js";
import { assertAddressCount } from "@ckd/core/bip32-limits.js";
import { HDKey } from "@scure/bip32";
import { secp256k1 } from "@ckd/core/crypto.js";
import { bip32VersionsFor } from "@ckd/core/networks.js";
import { assertPublicBatchLookupInput } from "@ckd/secret-boundary/public-input-guard.js";
import type {
  DetectedWatchOnlyMaterial,
  ResolvedWatchOnlyTarget,
  WatchOnlyAdapterLike,
} from "./watch-only/types.js";
import { DASH_WATCH_ONLY_PREFIX_COINS } from "./watch-only/dash-profile.js";

export class WatchOnlyNotRecognizedError extends Error {
  // Adapters use this distinction to fan out in Auto mode without treating an
  // unrelated coin format as malformed input.
  constructor(message = "This value was not recognized as supported watch-only material.") {
    super(message);
    this.name = "WatchOnlyNotRecognizedError";
  }
}

export class WatchOnlyNeedsFamilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WatchOnlyNeedsFamilyError";
  }
}

const WATCH_ONLY_PREFIX_COINS = DASH_WATCH_ONLY_PREFIX_COINS;

export function assertWatchOnlyMinimum(count: number): void {
  assertAddressCount(count, "The watch-only address minimum");
}

interface ExplicitPrefixMatch {
  prefix: string;
  value: string;
}

const EXPLICIT_PREFIX_PATTERN = /^([a-z][a-z0-9-]*)\s*:\s*([\s\S]*)$/iu;

export function matchExplicitPrefix(raw: string): ExplicitPrefixMatch | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return null;
  const match = EXPLICIT_PREFIX_PATTERN.exec(trimmed);
  if (match === null) return null;
  return { prefix: match[1]!.toLowerCase(), value: match[2]!.trim() };
}

export function foreignPrefixCoin(
  raw: string,
  ownCoinId: string,
  prefixCoins: Readonly<Record<string, string>> = WATCH_ONLY_PREFIX_COINS,
): string | null {
  const matched = matchExplicitPrefix(raw);
  if (matched === null) return null;
  const targetCoin = prefixCoins[matched.prefix];
  return targetCoin === undefined || targetCoin === ownCoinId ? null : targetCoin;
}

const EXTENDED_PUBLIC_KEY_PATTERN = /^[xt]pub[1-9A-HJ-NP-Za-km-z]{100,120}$/u;
export function looksLikeExtendedPublicKey(value: string): boolean {
  return EXTENDED_PUBLIC_KEY_PATTERN.test(value.trim());
}

export function looksLikeSec1PublicKey(value: string): boolean {
  return SEC1_KEY_HEX.test(value.trim());
}
/** The canonical form of a pasted hex key. */
export const normalizedHexKey = normalizedHex;

/**
 * The keys of a single watch-only public key, in both SEC1 forms. Refuses text that is no point of
 * secp256k1, so that no address is made from it.
 */
export function watchOnlyPublicKey(value: string): {
  compressed: Uint8Array;
  uncompressed: Uint8Array;
} {
  let point: ReturnType<typeof secp256k1.Point.fromHex>;
  try {
    point = secp256k1.Point.fromHex(normalizedHexKey(value));
  } catch {
    throw new Error("This public key is not a valid point on the secp256k1 curve.");
  }
  return { compressed: point.toBytes(true), uncompressed: point.toBytes(false) };
}

/** What reads watch-only material: from its explicit prefix, or from its bare form. */
export interface WatchOnlyReaders {
  prefixed(
    matched: ExplicitPrefixMatch,
    trimmed: string,
    mode: { auto: boolean },
  ): DetectedWatchOnlyMaterial;
  bare(trimmed: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial;
}

/** A coin's detector of watch-only material, made from its two readers. */
export function watchOnlyDetector(
  read: WatchOnlyReaders,
): (raw: string, mode: { auto: boolean }) => DetectedWatchOnlyMaterial {
  return (raw, mode) => {
    const trimmed = raw.trim();
    const matched = matchExplicitPrefix(trimmed);
    return matched === null ? read.bare(trimmed, mode) : read.prefixed(matched, trimmed, mode);
  };
}

/** The value after an explicit prefix; a prefix with nothing after it is refused. */
export function prefixedValue(matched: ExplicitPrefixMatch): string {
  if (!matched.value) throw new Error(`${matched.prefix}: requires a value.`);
  return matched.value;
}

/** A single public key as the watch-only material of `coinId`. */
export function publicKeyMaterial(coinId: string, value: string): DetectedWatchOnlyMaterial {
  return { coinId, kind: "public-key", value: normalizedHexKey(value) };
}

/**
 * A bare public key, which every coin could own: only a coin that the person chose claims it, never
 * automatic detection. Null when `trimmed` is no public key.
 */
export function chosenCoinPublicKey(
  trimmed: string,
  coinId: string,
  mode: { auto: boolean },
): DetectedWatchOnlyMaterial | null {
  if (!looksLikeSec1PublicKey(trimmed)) return null;
  if (mode.auto) throw new WatchOnlyNotRecognizedError();
  return publicKeyMaterial(coinId, trimmed);
}

/**
 * Refuses an explicit prefix that the coin's detector does not read. Automatic detection only
 * learns that the input is not this coin's; a person who chose the coin learns whose prefix it is.
 * Without `prefixCoins` the build knows no other coin by name, so the message names none.
 */
export function refuseOtherPrefix(
  trimmed: string,
  matched: ExplicitPrefixMatch,
  coin: { readonly id: string; readonly label: string },
  mode: { auto: boolean },
  prefixCoins?: Readonly<Record<string, string>>,
): never {
  const conflict = foreignPrefixCoin(trimmed, coin.id, prefixCoins);
  if (mode.auto) throw new WatchOnlyNotRecognizedError();
  if (conflict === null) throw new Error(`Unrecognized prefix "${matched.prefix}:".`);
  throw new Error(
    prefixCoins === undefined
      ? `"${matched.prefix}:" belongs to another coin, not ${coin.label}. Remove the prefix or select the matching edition.`
      : `"${matched.prefix}:" belongs to ${conflict}, not ${coin.label}. Remove the prefix or select ${conflict[0]!.toUpperCase()}${conflict.slice(1)}.`,
  );
}

export function parseWatchOnlyLines(raw: string): string[] {
  if (raw.trim().startsWith("{")) {
    try {
      JSON.parse(raw);
      return [raw.trim()];
    } catch {
      /* line-oriented batch */
    }
  }
  return nonEmptyLines(raw);
}

export function assertWatchOnlyBatchInput(raw: string): void {
  assertPublicBatchLookupInput(raw);
  const effective = parseWatchOnlyLines(raw)
    .map((line) => {
      const matched = matchExplicitPrefix(line);
      if (matched === null) return line;
      if (matched.prefix === "orchard-ovk" && /^(?:0x)?[0-9a-f]{64}$/iu.test(matched.value))
        return "explicit-orchard-viewing-capability";
      return matched.value;
    })
    .join("\n");
  assertPublicBatchLookupInput(effective);
}

export function resolveWatchOnlyTargets(
  raw: string,
  adapters: readonly WatchOnlyAdapterLike[],
  prefixCoins: Readonly<Record<string, string>> = WATCH_ONLY_PREFIX_COINS,
  multiChain = false,
  networklessAdapterIds: readonly string[] = [],
  supportedDepths: (adapterId: string) => readonly number[] = WatchOnlyDepthPolicy.supported,
  singleChainCoinId = "dash",
): ResolvedWatchOnlyTarget[] {
  assertWatchOnlyBatchInput(raw);
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Enter a public key.");
  const prefix = matchExplicitPrefix(trimmed);
  const value = prefix?.value ?? trimmed;
  const owner =
    prefix === null || !Object.hasOwn(prefixCoins, prefix.prefix)
      ? undefined
      : prefixCoins[prefix.prefix];
  const sharedPublicKey =
    (prefix === null || prefix.prefix === "public-key") && looksLikeSec1PublicKey(value);
  const sharedXpub = prefix === null && looksLikeExtendedPublicKey(value);
  let depth: number | undefined;
  let network: "mainnet" | "testnet" | undefined;
  if (sharedPublicKey || prefix?.prefix === "public-key") {
    watchOnlyPublicKey(value);
  }
  if (looksLikeExtendedPublicKey(value)) {
    network = value.startsWith("tpub") ? "testnet" : "mainnet";
    try {
      const node = HDKey.fromExtendedKey(value, bip32VersionsFor(network));
      depth = node.depth;
      if (depth === 0)
        throw new Error(
          "A root/master xpub cannot derive standard wallet accounts. Enter an account or branch public key.",
        );
    } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith("A root/")) throw cause;
      throw new Error("This extended public key is malformed or has an invalid checksum.");
    }
  }
  const candidates: ResolvedWatchOnlyTarget[] = [];
  for (const adapter of adapters) {
    if (adapter.detectWatchOnly === undefined || (owner !== undefined && owner !== adapter.id))
      continue;
    if (sharedXpub && depth !== undefined) {
      const supported = supportedDepths(adapter.id);
      if (!supported.includes(depth) || (multiChain === false && adapter.id !== singleChainCoinId))
        continue;
      if (networklessAdapterIds.includes(adapter.id) && network === "testnet") continue;
    }
    try {
      const material = adapter.detectWatchOnly(trimmed, { auto: !(sharedPublicKey || sharedXpub) });
      const inferredNetwork =
        material.bundleNetwork ??
        (networklessAdapterIds.includes(adapter.id) ? undefined : network);
      candidates.push({
        adapterId: adapter.id,
        material,
        ...(sharedXpub || sharedPublicKey
          ? {
              ambiguity: {
                kind: sharedXpub ? ("bip32" as const) : ("sec1" as const),
                ...(depth === undefined ? {} : { depth }),
              },
            }
          : {}),
        ...(inferredNetwork === undefined ? {} : { network: inferredNetwork }),
      });
    } catch (cause) {
      if (cause instanceof WatchOnlyNeedsFamilyError && adapters.length > 1) continue;
      if (!(cause instanceof WatchOnlyNotRecognizedError)) throw cause;
    }
  }
  if (candidates.length === 0) {
    if (owner !== undefined && !adapters.some(({ id }) => id === owner))
      throw new Error(
        "This key belongs to a coin unavailable in this edition. Open the Multi-Chain scanner.",
      );
    throw new Error(
      "No supported scan matches this public key format or derivation depth. Enter a public key, account/branch xpub, descriptor, or Orchard viewing key.",
    );
  }
  if (owner === undefined && candidates.length > 1 && /^pkh\(/u.test(value))
    for (const candidate of candidates) candidate.ambiguity = { kind: "bip32" };
  return candidates;
}
