import { HDKey } from '@scure/bip32';
import { getDashNetwork } from '@ckd/core/networks.js';
import { descriptorChecksum } from '@ckd/export/descriptor.js';
import { normalizeViewingKey } from '@ckd/dash-network/viewing-key.js';
import type { DetectedWatchOnlyMaterial } from './types.js';
import {
  foreignPrefixCoin,
  looksLikeExtendedPublicKey,
  looksLikeSec1PublicKey,
  matchExplicitPrefix,
  normalizedHexKey,
  WatchOnlyNeedsFamilyError,
  WatchOnlyNotRecognizedError,
} from '../watch-only.js';

const HASH160_PATTERN = /^(?:0x)?[0-9a-f]{40}$/iu;
const ECDSA_PUBLIC_KEY_PATTERN = /^(?:0x)?(?:02|03)[0-9a-f]{64}$/iu;
const ORCHARD_BUNDLE_HEX_LENGTH = { fvk: 192, ivk: 128 } as const;

function looksLikeOrchardBundleOrRaw(value: string): 'bundle' | 'fvk' | 'ivk' | false {
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) return 'bundle';
  const hex = trimmed.replace(/^0x/iu, '').replace(/\s+/gu, '');
  if (!/^[0-9a-f]+$/iu.test(hex)) return false;
  if (hex.length === ORCHARD_BUNDLE_HEX_LENGTH.fvk) return 'fvk';
  if (hex.length === ORCHARD_BUNDLE_HEX_LENGTH.ivk) return 'ivk';
  return false;
}

function detectDashDescriptor(text: string, explicit = false): DetectedWatchOnlyMaterial {
  const match =
    /^pkh\(\[([0-9a-f]{8})((?:\/\d+[h'])+)\]([xt]pub[1-9A-HJ-NP-Za-km-z]+)\/([01])\/\*\)#([0-9a-z]{8})$/iu.exec(text);
  if (match === null) {
    if (explicit)
      throw new Error('Expected a checksummed Dash pkh([fingerprint/path]xpub/0/*) or /1/* public descriptor.');
    throw new WatchOnlyNotRecognizedError();
  }
  const [, , suffix, xpub, branchText, checksum] = match;
  const parts = suffix!
    .slice(1)
    .split('/')
    .map((part) => Number(part.slice(0, -1)));
  const network = xpub!.startsWith('tpub') ? 'testnet' : 'mainnet';
  const coin = getDashNetwork(network).coinType;
  const legacy = parts.length === 1;
  const core = parts.length === 3 && parts[0] === 44 && parts[1] === coin;
  const coinjoin = parts.length === 4 && parts[0] === 9 && parts[1] === coin && parts[2] === 4;
  if (
    (!legacy && !core && !coinjoin) ||
    parts.some((part) => !Number.isSafeInteger(part) || part < 0 || part > 0x7fffffff)
  ) {
    if (explicit)
      throw new Error(
        'Descriptor origin must identify a supported Dash Core, legacy mobile or DIP9 CoinJoin account on its encoded network.',
      );
    throw new WatchOnlyNotRecognizedError();
  }
  if (descriptorChecksum(text.slice(0, text.lastIndexOf('#'))) !== checksum)
    throw new Error('Dash descriptor checksum does not match its content.');
  const account = HDKey.fromExtendedKey(xpub!, getDashNetwork(network).versions);
  if (account.depth !== parts.length || account.index !== parts.at(-1)! + 0x80000000)
    throw new Error('Dash descriptor account depth or child index disagrees with its origin.');
  const branch = Number(branchText);
  return {
    coinId: 'dash',
    kind: legacy ? 'dash-legacy-xpub' : coinjoin ? 'dash-coinjoin-xpub' : 'dash-core-xpub',
    value: account.deriveChild(branch).publicExtendedKey,
    bundleNetwork: network,
    descriptorPath: `m${suffix!.replaceAll('h', "'")}/${branch}`,
    detectionLabel: `Dash ${legacy ? 'legacy mobile' : coinjoin ? 'Mobile CoinJoin · DIP9' : 'Core BIP44'} descriptor · ${branch === 0 ? 'receive' : 'change'}`,
  };
}

function sniffExtendedKeyDepth(value: string): number {
  const network = value.trim().startsWith('tpub') ? 'testnet' : 'mainnet';
  try {
    return HDKey.fromExtendedKey(value, getDashNetwork(network).versions).depth;
  } catch {
    throw new Error('This extended public key is malformed.');
  }
}

export function detectDashWatchOnly(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial {
  const trimmed = raw.trim();
  const matched = matchExplicitPrefix(trimmed);
  if (matched !== null) {
    if (matched.prefix === 'dash-descriptor') return detectDashDescriptor(matched.value, true);
    if (['dash-legacy-xpub', 'dash-core-xpub', 'dash-coinjoin-xpub', 'dash-platform-xpub'].includes(matched.prefix)) {
      if (!matched.value) throw new Error(`${matched.prefix}: requires a value.`);
      return {
        coinId: 'dash',
        kind: matched.prefix as 'dash-legacy-xpub' | 'dash-core-xpub' | 'dash-coinjoin-xpub' | 'dash-platform-xpub',
        value: matched.value,
      };
    }
    if (matched.prefix === 'public-key') {
      if (!matched.value) throw new Error('public-key: requires a value.');
      return { coinId: 'dash', kind: 'public-key', value: normalizedHexKey(matched.value) };
    }
    if (matched.prefix === 'identity') {
      if (!matched.value) throw new Error('identity: requires a value.');
      const value = normalizedHexKey(matched.value);
      if (!HASH160_PATTERN.test(value) && !ECDSA_PUBLIC_KEY_PATTERN.test(value))
        throw new Error(
          'identity: requires a compressed ECDSA public key (33-byte hex) or its HASH160 (20-byte hex). This scanner performs a single proof-verified lookup by unique public-key hash and does not support Identity IDs, DPNS names, or BLS keys.',
        );
      return { coinId: 'dash', kind: 'identity', value };
    }
    if (matched.prefix === 'orchard-fvk' || matched.prefix === 'orchard-ivk' || matched.prefix === 'orchard-ovk') {
      const key = normalizeViewingKey(matched.value, matched.prefix === 'orchard-ovk' ? 'outgoing' : 'automatic');
      try {
        if (matched.prefix === 'orchard-fvk' && key.kind !== 'full')
          throw new Error('orchard-fvk: requires a 96-byte Full Viewing Key.');
        if (matched.prefix === 'orchard-ivk' && key.kind !== 'incoming')
          throw new Error('orchard-ivk: requires a 64-byte Incoming Viewing Key.');
        if (matched.prefix === 'orchard-ovk' && key.kind !== 'outgoing')
          throw new Error('orchard-ovk: requires the raw 32-byte Outgoing Viewing Key.');
        return {
          coinId: 'dash',
          kind: matched.prefix,
          value: key.hex,
          ...(key.bundleNetwork === undefined ? {} : { bundleNetwork: key.bundleNetwork }),
        };
      } finally {
        key.hex = '';
      }
    }
    const conflict = foreignPrefixCoin(trimmed, 'dash');
    if (conflict !== null) {
      if (mode.auto) throw new WatchOnlyNotRecognizedError();
      throw new Error(
        `"${matched.prefix}:" belongs to another coin, not Dash. Remove the prefix or select the matching edition.`,
      );
    }
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    throw new Error(`Unrecognized prefix "${matched.prefix}:".`);
  }
  if (/^pkh\(/u.test(trimmed)) return detectDashDescriptor(trimmed);
  const orchardShape = looksLikeOrchardBundleOrRaw(trimmed);
  if (orchardShape !== false) {
    const key = normalizeViewingKey(trimmed, 'automatic');
    try {
      return {
        coinId: 'dash',
        kind: key.kind === 'full' ? 'orchard-fvk' : 'orchard-ivk',
        value: key.hex,
        ...(key.bundleNetwork === undefined ? {} : { bundleNetwork: key.bundleNetwork }),
      };
    } finally {
      key.hex = '';
    }
  }
  if (looksLikeExtendedPublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    const depth = sniffExtendedKeyDepth(trimmed);
    if (depth === 3)
      return {
        coinId: 'dash',
        kind: 'dash-core-xpub',
        value: trimmed,
        detectionLabel: 'Dash Core · candidate account xpub',
      };
    throw new WatchOnlyNeedsFamilyError(
      `A Dash xpub at depth ${depth} does not encode its hardened ancestry. Prefix it with dash-core-xpub:, dash-legacy-xpub:, dash-coinjoin-xpub:, or dash-platform-xpub: so the scanner uses the intended address family.`,
    );
  }
  if (looksLikeSec1PublicKey(trimmed)) {
    if (mode.auto) throw new WatchOnlyNotRecognizedError();
    return { coinId: 'dash', kind: 'public-key', value: normalizedHexKey(trimmed) };
  }
  throw new WatchOnlyNotRecognizedError();
}
