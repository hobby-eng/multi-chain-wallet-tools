import { MAX_BIP32_INDEX } from '@ckd/core/bip32.js';
import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@ckd/core/crypto.js';
import { assertPublicBatchLookupInput } from '@ckd/secret-boundary/public-input-guard.js';
import type { ResolvedWatchOnlyTarget, WatchOnlyAdapterLike } from './watch-only/types.js';
import { DASH_WATCH_ONLY_PREFIX_COINS } from './watch-only/dash-profile.js';

export class WatchOnlyNotRecognizedError extends Error {
  // Adapters use this distinction to fan out in Auto mode without treating an
  // unrelated coin format as malformed input.
  constructor(message = 'This value was not recognized as supported watch-only material.') {
    super(message);
    this.name = 'WatchOnlyNotRecognizedError';
  }
}

export class WatchOnlyNeedsFamilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchOnlyNeedsFamilyError';
  }
}

const WATCH_ONLY_PREFIX_COINS = DASH_WATCH_ONLY_PREFIX_COINS;

export function assertWatchOnlyMinimum(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_BIP32_INDEX + 1) {
    throw new Error(`The watch-only address minimum must be an integer from 1 to ${MAX_BIP32_INDEX + 1}.`);
  }
}

interface ExplicitPrefixMatch {
  prefix: string;
  value: string;
}

const EXPLICIT_PREFIX_PATTERN = /^([a-z][a-z0-9-]*)\s*:\s*([\s\S]*)$/iu;

export function matchExplicitPrefix(raw: string): ExplicitPrefixMatch | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return null;
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

const SEC1_PUBLIC_KEY_PATTERN = /^(?:0x)?(?:04[0-9a-f]{128}|0[23][0-9a-f]{64})$/iu;
export function looksLikeSec1PublicKey(value: string): boolean {
  return SEC1_PUBLIC_KEY_PATTERN.test(value.trim());
}
export function normalizedHexKey(value: string): string {
  return value.trim().toLowerCase().replace(/^0x/u, '');
}

export function parseWatchOnlyLines(raw: string): string[] {
  if (raw.trim().startsWith('{')) {
    try {
      JSON.parse(raw);
      return [raw.trim()];
    } catch {
      /* line-oriented batch */
    }
  }
  return raw
    .replaceAll('\r', '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function assertWatchOnlyBatchInput(raw: string): void {
  assertPublicBatchLookupInput(raw);
  const effective = parseWatchOnlyLines(raw)
    .map((line) => {
      const matched = matchExplicitPrefix(line);
      if (matched === null) return line;
      if (matched.prefix === 'orchard-ovk' && /^(?:0x)?[0-9a-f]{64}$/iu.test(matched.value))
        return 'explicit-orchard-viewing-capability';
      return matched.value;
    })
    .join('\n');
  assertPublicBatchLookupInput(effective);
}

export function resolveWatchOnlyTargets(
  raw: string,
  adapters: readonly WatchOnlyAdapterLike[],
  prefixCoins: Readonly<Record<string, string>> = WATCH_ONLY_PREFIX_COINS,
  multiChain = false,
  networklessAdapterIds: readonly string[] = [],
  supportedDepths: (adapterId: string) => readonly number[] = () => [3, 4, 5],
  singleChainCoinId = 'dash',
): ResolvedWatchOnlyTarget[] {
  assertWatchOnlyBatchInput(raw);
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Enter a public key.');
  const prefix = matchExplicitPrefix(trimmed);
  const value = prefix?.value ?? trimmed;
  const owner = prefix === null || !Object.hasOwn(prefixCoins, prefix.prefix) ? undefined : prefixCoins[prefix.prefix];
  const sharedPublicKey = (prefix === null || prefix.prefix === 'public-key') && looksLikeSec1PublicKey(value);
  const sharedXpub = prefix === null && looksLikeExtendedPublicKey(value);
  let depth: number | undefined;
  let network: 'mainnet' | 'testnet' | undefined;
  if (sharedPublicKey || prefix?.prefix === 'public-key') {
    try {
      secp256k1.Point.fromHex(normalizedHexKey(value));
    } catch {
      throw new Error('This public key is not a valid point on the secp256k1 curve.');
    }
  }
  if (looksLikeExtendedPublicKey(value)) {
    network = value.startsWith('tpub') ? 'testnet' : 'mainnet';
    try {
      const node = HDKey.fromExtendedKey(
        value,
        network === 'testnet'
          ? { private: 0x04358394, public: 0x043587cf }
          : { private: 0x0488ade4, public: 0x0488b21e },
      );
      depth = node.depth;
      if (depth === 0)
        throw new Error(
          'A root/master xpub cannot derive standard wallet accounts. Enter an account or branch public key.',
        );
    } catch (cause) {
      if (cause instanceof Error && cause.message.startsWith('A root/')) throw cause;
      throw new Error('This extended public key is malformed or has an invalid checksum.');
    }
  }
  const candidates: ResolvedWatchOnlyTarget[] = [];
  for (const adapter of adapters) {
    if (adapter.detectWatchOnly === undefined || (owner !== undefined && owner !== adapter.id)) continue;
    if (sharedXpub && depth !== undefined) {
      const supported = supportedDepths(adapter.id);
      if (!supported.includes(depth) || (multiChain === false && adapter.id !== singleChainCoinId)) continue;
      if (networklessAdapterIds.includes(adapter.id) && network === 'testnet') continue;
    }
    try {
      const material = adapter.detectWatchOnly(trimmed, { auto: !(sharedPublicKey || sharedXpub) });
      const inferredNetwork =
        material.bundleNetwork ?? (networklessAdapterIds.includes(adapter.id) ? undefined : network);
      candidates.push({
        adapterId: adapter.id,
        material,
        ...(sharedXpub || sharedPublicKey
          ? {
              ambiguity: {
                kind: sharedXpub ? ('bip32' as const) : ('sec1' as const),
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
      throw new Error('This key belongs to a coin unavailable in this edition. Open the Multi-Chain scanner.');
    throw new Error(
      'No supported scan matches this public key format or derivation depth. Enter a public key, account/branch xpub, descriptor, or Orchard viewing key.',
    );
  }
  if (owner === undefined && candidates.length > 1 && /^pkh\(/u.test(value))
    for (const candidate of candidates) candidate.ambiguity = { kind: 'bip32' };
  return candidates;
}
