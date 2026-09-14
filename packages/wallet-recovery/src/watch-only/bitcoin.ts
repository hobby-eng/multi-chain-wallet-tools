import { HDKey } from '@scure/bip32';
import type { DetectedWatchOnlyMaterial } from './types.js';
import {
  foreignPrefixCoin,
  looksLikeExtendedPublicKey,
  looksLikeSec1PublicKey,
  matchExplicitPrefix,
  normalizedHexKey,
  WatchOnlyNotRecognizedError,
} from '../watch-only.js';
import { MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS } from './multi-chain-profile.js';

type BitcoinMode = 'legacy' | 'nested-segwit' | 'native-segwit' | 'taproot';
const DESCRIPTOR_PATTERNS: ReadonlyArray<{ mode: BitcoinMode; pattern: RegExp }> = [
  {
    mode: 'legacy',
    pattern: /^pkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/(\d+)\/\*\)#([0-9a-z]{8})$/iu,
  },
  {
    mode: 'nested-segwit',
    pattern:
      /^sh\(wpkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/\d+\/\*\)\)#([0-9a-z]{8})$/iu,
  },
  {
    mode: 'native-segwit',
    pattern: /^wpkh\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/\d+\/\*\)#([0-9a-z]{8})$/iu,
  },
  {
    mode: 'taproot',
    pattern: /^tr\(\[([0-9a-f]{8})((?:\/\d+[h']?)*)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/\d+\/\*\)#([0-9a-z]{8})$/iu,
  },
];

const SLIP132_PUBLIC_VERSIONS = [
  {
    prefix: 'ypub',
    public: 0x049d7cb2,
    private: 0x049d7878,
    network: 'mainnet' as const,
    label: 'Bitcoin Nested SegWit · SLIP-132 ypub',
  },
  {
    prefix: 'zpub',
    public: 0x04b24746,
    private: 0x04b2430c,
    network: 'mainnet' as const,
    label: 'Bitcoin Native SegWit · SLIP-132 zpub',
  },
  {
    prefix: 'upub',
    public: 0x044a5262,
    private: 0x044a4e28,
    network: 'testnet' as const,
    label: 'Bitcoin Nested SegWit testnet · SLIP-132 upub',
  },
  {
    prefix: 'vpub',
    public: 0x045f1cf6,
    private: 0x045f18bc,
    network: 'testnet' as const,
    label: 'Bitcoin Native SegWit testnet · SLIP-132 vpub',
  },
] as const;

function parseSlip132(value: string): { network: 'mainnet' | 'testnet'; label: string } | null {
  const version = SLIP132_PUBLIC_VERSIONS.find(({ prefix }) => value.startsWith(prefix));
  if (version === undefined) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]{100,120}$/u.test(value))
    throw new Error(`This ${version.prefix} extended public key is malformed.`);
  try {
    HDKey.fromExtendedKey(value, { private: version.private, public: version.public });
  } catch {
    throw new Error(`This ${version.prefix} extended public key is malformed or has an invalid checksum.`);
  }
  return { network: version.network, label: version.label };
}

export function detectBitcoinWatchOnly(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial {
  const trimmed = raw.trim();
  const matched = matchExplicitPrefix(trimmed);
  if (matched !== null) {
    if (matched.prefix === 'bitcoin-xpub') {
      if (!matched.value) throw new Error('bitcoin-xpub: requires a value.');
      const slip132 = parseSlip132(matched.value);
      return {
        coinId: 'bitcoin',
        kind: 'bitcoin-xpub',
        value: matched.value,
        ...(slip132 === null ? {} : { detectionLabel: slip132.label, bundleNetwork: slip132.network }),
      };
    }
    if (matched.prefix === 'public-key') {
      if (!matched.value) throw new Error('public-key: requires a value.');
      return { coinId: 'bitcoin', kind: 'public-key', value: normalizedHexKey(matched.value) };
    }
    const conflict = foreignPrefixCoin(trimmed, 'bitcoin', MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS);
    if (conflict !== null) {
      if (mode.auto) throw new WatchOnlyNotRecognizedError();
      throw new Error(
        `"${matched.prefix}:" belongs to ${conflict}, not Bitcoin. Remove the prefix or select ${conflict === 'dash' ? 'Dash' : 'Ethereum'}.`,
      );
    }
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    throw new Error(`Unrecognized prefix "${matched.prefix}:".`);
  }
  const descriptor = DESCRIPTOR_PATTERNS.find(({ pattern }) => pattern.test(trimmed));
  if (descriptor !== undefined) {
    const label =
      descriptor.mode === 'legacy'
        ? 'Legacy'
        : descriptor.mode === 'nested-segwit'
          ? 'Nested SegWit'
          : descriptor.mode === 'native-segwit'
            ? 'Native SegWit'
            : 'Taproot';
    return {
      coinId: 'bitcoin',
      kind: 'bitcoin-descriptor',
      value: trimmed,
      detectionLabel: `Bitcoin ${label} · exact descriptor`,
    };
  }
  const slip132 = parseSlip132(trimmed);
  if (slip132 !== null)
    return {
      coinId: 'bitcoin',
      kind: 'bitcoin-xpub',
      value: trimmed,
      detectionLabel: slip132.label,
      bundleNetwork: slip132.network,
    };
  if (looksLikeExtendedPublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return {
      coinId: 'bitcoin',
      kind: 'bitcoin-xpub',
      value: trimmed,
      detectionLabel: 'Bitcoin · candidate account formats',
    };
  }
  if (looksLikeSec1PublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return { coinId: 'bitcoin', kind: 'public-key', value: normalizedHexKey(trimmed) };
  }
  throw new WatchOnlyNotRecognizedError();
}
