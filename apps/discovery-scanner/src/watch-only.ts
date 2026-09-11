import { MAX_BIP32_INDEX } from '@ckd/core/bip32.js';
import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@ckd/core/crypto.js';
import { assertPublicBatchLookupInput } from '@ckd/dash-network/private-material.js';
import type { DetectedWatchOnlyMaterial } from './types.js';

declare const __DASH_COMMUNITY__: boolean;

/**
 * Thrown by `RecoveryCoinAdapter.detectWatchOnly` when the pasted line does
 * not belong to that coin at all (as opposed to belonging but being
 * malformed, which throws a normal descriptive `Error`). `resolveWatchOnlyTarget`
 * uses this distinction to fan out across every adapter in Auto mode without
 * ever treating "not mine" the same as "invalid".
 */
export class WatchOnlyNotRecognizedError extends Error {
  constructor(message = 'This value was not recognized as supported watch-only material.') {
    super(message);
    this.name = 'WatchOnlyNotRecognizedError';
  }
}

/** The coin is known, but an ordinary xpub does not encode its hardened family. */
export class WatchOnlyNeedsFamilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchOnlyNeedsFamilyError';
  }
}

/**
 * Explicit prefixes and the single coin each unambiguously names. `public-key:`
 * is deliberately absent: a bare SEC1 public key carries no chain metadata in
 * this tool, so it is coin-agnostic and only ever resolved by an explicitly
 * selected coin, never by Auto.
 */
export const WATCH_ONLY_PREFIX_COINS: Readonly<Record<string, string>> = {
  ...(__DASH_COMMUNITY__ ? {} : {
    'bitcoin-xpub': 'bitcoin',
    'ethereum-xpub': 'ethereum',
  }),
  'dash-core-xpub': 'dash',
  'dash-descriptor': 'dash',
  'dash-legacy-xpub': 'dash',
  'dash-coinjoin-xpub': 'dash',
  'dash-platform-xpub': 'dash',
  identity: 'dash',
  'orchard-fvk': 'dash',
  'orchard-ivk': 'dash',
  'orchard-ovk': 'dash',
};

function prefixCoin(prefix: string): string | undefined {
  return Object.hasOwn(WATCH_ONLY_PREFIX_COINS, prefix) ? WATCH_ONLY_PREFIX_COINS[prefix] : undefined;
}

export function assertWatchOnlyMinimum(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_BIP32_INDEX + 1) {
    throw new Error(`The watch-only address minimum must be an integer from 1 to ${MAX_BIP32_INDEX + 1}.`);
  }
}

export const WATCH_ONLY_EXPLICIT_PREFIXES: readonly string[] = [
  ...Object.keys(WATCH_ONLY_PREFIX_COINS),
  'public-key',
];

export interface ExplicitPrefixMatch {
  prefix: string;
  value: string;
}

const EXPLICIT_PREFIX_PATTERN = /^([a-z][a-z0-9-]*)\s*:\s*([\s\S]*)$/iu;

/** Matches any `word:` shaped prefix, recognized or not; callers decide what to do with it. */
export function matchExplicitPrefix(raw: string): ExplicitPrefixMatch | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return null; // an Orchard viewing bundle is JSON, not a `prefix:value` line.
  const match = EXPLICIT_PREFIX_PATTERN.exec(trimmed);
  if (match === null) return null;
  const prefix = match[1]!.toLowerCase();
  const value = match[2]!.trim();
  return { prefix, value };
}

/**
 * Returns the coin id a foreign explicit prefix names, or null when `raw`
 * carries no prefix, an unrecognized prefix, or a prefix already owned by
 * `ownCoinId`. Coin adapters use this to raise a specific conflict error
 * ("this is a Dash prefix, but Bitcoin is selected") instead of a generic
 * "not recognized" message.
 */
export function foreignPrefixCoin(raw: string, ownCoinId: string): string | null {
  const matched = matchExplicitPrefix(raw);
  if (matched === null) return null;
  const targetCoin = prefixCoin(matched.prefix);
  if (targetCoin === undefined || targetCoin === ownCoinId) return null;
  return targetCoin;
}

const EXTENDED_PUBLIC_KEY_PATTERN = /^[xt]pub[1-9A-HJ-NP-Za-km-z]{100,120}$/u;

/** Bare base58 extended public key shape. This build only ever emits the shared "xpub"/"tpub" human prefixes. */
export function looksLikeExtendedPublicKey(value: string): boolean {
  return EXTENDED_PUBLIC_KEY_PATTERN.test(value.trim());
}

const SEC1_PUBLIC_KEY_PATTERN = /^(?:0x)?(?:04[0-9a-f]{128}|0[23][0-9a-f]{64})$/iu;

/** Bare compressed (33-byte) or uncompressed (65-byte) SEC1 public key hex shape. */
export function looksLikeSec1PublicKey(value: string): boolean {
  return SEC1_PUBLIC_KEY_PATTERN.test(value.trim());
}

export function normalizedHexKey(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/u, '');
}

const BITCOIN_DESCRIPTOR_SHAPE_PATTERN = /^(?:pkh\(|sh\(wpkh\(|wpkh\(|tr\()[^\s#]+\)+#[0-9a-z]{8}$/iu;

/** Coarse shape check only; `descriptorChecksum` performs the real BIP380 validation. */
export function looksLikeBitcoinDescriptor(value: string): boolean {
  return BITCOIN_DESCRIPTOR_SHAPE_PATTERN.test(value.trim());
}

/** A bare xpub/tpub or SEC1 public key uses BIP32 version bytes and curve points shared by every coin in this build. */
export function isAmbiguousBareKey(value: string): boolean {
  return looksLikeExtendedPublicKey(value) || looksLikeSec1PublicKey(value);
}

export function parseWatchOnlyLines(raw: string): string[] {
  if (raw.trim().startsWith('{')) {
    try { JSON.parse(raw); return [raw.trim()]; } catch { /* May be a line-oriented batch. */ }
  }
  return raw
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Batch-level private-material tripwire for the watch-only field. Mirrors
 * the Activity Viewer's `assertAutoViewerBatchInput`: an explicit
 * `orchard-ovk:` value is a raw 32-byte hex Outgoing Viewing Key, which is
 * otherwise indistinguishable from a private key and is correctly rejected
 * by the generic 64-hex-character check. The full pasted text is checked
 * once in its original (prefixed) form, then again with every recognized
 * prefix stripped and any bare-OVK payload replaced by an inert sentinel, so
 * the rest of the pasted text remains fully covered by the private-material
 * check.
 */
export function assertWatchOnlyBatchInput(raw: string): void {
  assertPublicBatchLookupInput(raw);
  const effective = parseWatchOnlyLines(raw)
    .map((line) => {
      const matched = matchExplicitPrefix(line);
      if (matched === null) return line;
      if (matched.prefix === 'orchard-ovk' && /^(?:0x)?[0-9a-f]{64}$/iu.test(matched.value)) {
        return 'explicit-orchard-viewing-capability';
      }
      return matched.value;
    })
    .join('\n');
  assertPublicBatchLookupInput(effective);
}

export interface WatchOnlyAdapterLike {
  readonly id: string;
  readonly label: string;
  detectWatchOnly?(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial;
}

export interface ResolvedWatchOnlyTarget {
  adapterId: string;
  material: DetectedWatchOnlyMaterial;
  network?: 'mainnet' | 'testnet';
  ambiguity?: { kind: 'bip32' | 'sec1'; depth?: number };
}

/** Resolve locally. Shared curve keys are candidates, never proof of coin ownership. */
export function resolveWatchOnlyTargets(
  raw: string,
  adapters: readonly WatchOnlyAdapterLike[],
): ResolvedWatchOnlyTarget[] {
  assertWatchOnlyBatchInput(raw);
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Enter a public key.');
  const prefix = matchExplicitPrefix(trimmed);
  const value = prefix?.value ?? trimmed;
  const owner = prefix === null ? undefined : prefixCoin(prefix.prefix);
  const sharedPublicKey = (prefix === null || prefix.prefix === 'public-key') && looksLikeSec1PublicKey(value);
  const sharedXpub = prefix === null && looksLikeExtendedPublicKey(value);
  let depth: number | undefined;
  let network: 'mainnet' | 'testnet' | undefined;
  if (sharedPublicKey || prefix?.prefix === 'public-key') {
    try { secp256k1.Point.fromHex(normalizedHexKey(value)); }
    catch { throw new Error('This public key is not a valid point on the secp256k1 curve.'); }
  }
  const extended = looksLikeExtendedPublicKey(value)
    ? value
    : looksLikeBitcoinDescriptor(value) ? /[xt]pub[1-9A-HJ-NP-Za-km-z]+/u.exec(value)?.[0] : undefined;
  if (extended !== undefined) {
    network = extended.startsWith('tpub') ? 'testnet' : 'mainnet';
    let node: HDKey;
    try {
      node = HDKey.fromExtendedKey(extended, network === 'testnet'
        ? { private: 0x04358394, public: 0x043587cf }
        : { private: 0x0488ade4, public: 0x0488b21e });
    } catch { throw new Error('This extended public key is malformed or has an invalid checksum.'); }
    depth = node.depth;
    if (depth === 0) throw new Error('A root/master xpub cannot derive standard wallet accounts. Enter an account or branch public key.');
  }
  const candidates: ResolvedWatchOnlyTarget[] = [];
  for (const adapter of adapters) {
    if (adapter.detectWatchOnly === undefined || (owner !== undefined && owner !== adapter.id)) continue;
    // Depth describes what can be derived, not which coin originally created the key.
    if (sharedXpub && depth !== undefined) {
      const supported = __DASH_COMMUNITY__
        ? [3, 4, 5]
        : adapter.id === 'bitcoin' ? [3, 4] : adapter.id === 'ethereum' ? [3, 4, 5] : [3, 4, 5];
      if (!supported.includes(depth) || (!__DASH_COMMUNITY__ && adapter.id === 'ethereum' && network === 'testnet')) continue;
    }
    try {
      const material = adapter.detectWatchOnly(trimmed, { auto: !(sharedPublicKey || sharedXpub) });
      // Ethereum uses the same xpub versions on mainnet and Sepolia.
      const inferredNetwork = material.bundleNetwork
        ?? (!__DASH_COMMUNITY__ && adapter.id === 'ethereum' ? undefined : network);
      candidates.push({ adapterId: adapter.id, material,
        ...((sharedXpub || sharedPublicKey) ? {
          ambiguity: { kind: sharedXpub ? 'bip32' as const : 'sec1' as const, ...(depth === undefined ? {} : { depth }) },
        } : {}),
        ...(inferredNetwork === undefined ? {} : { network: inferredNetwork }) });
    } catch (cause) {
      if (cause instanceof WatchOnlyNeedsFamilyError && adapters.length > 1) continue;
      if (!(cause instanceof WatchOnlyNotRecognizedError)) throw cause;
    }
  }
  if (candidates.length === 0) {
    if (owner !== undefined && !adapters.some(({ id }) => id === owner)) {
      throw new Error('This key belongs to a coin unavailable in this edition. Open the Multi-Chain scanner.');
    }
    throw new Error(__DASH_COMMUNITY__
      ? 'No supported Dash scan matches this public key format or derivation depth. Enter a public key, account/branch xpub, or Dash Orchard viewing key.'
      : 'No supported scan matches this public key format or derivation depth. Enter a public key, account/branch xpub, Bitcoin descriptor, or Dash Orchard viewing key.');
  }
  if (owner === undefined && candidates.length > 1 && /^pkh\(/u.test(value)) {
    for (const candidate of candidates) candidate.ambiguity = { kind: 'bip32' };
  }
  return candidates;
}
