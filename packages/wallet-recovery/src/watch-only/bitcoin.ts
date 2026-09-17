import type { DetectedWatchOnlyMaterial } from './types.js';
import { bitcoinWatchModeLabel, parseBitcoinSlip132, parseBitcoinWatchDescriptor } from './bitcoin-formats.js';
import {
  foreignPrefixCoin,
  looksLikeExtendedPublicKey,
  looksLikeSec1PublicKey,
  matchExplicitPrefix,
  normalizedHexKey,
  WatchOnlyNotRecognizedError,
} from '../watch-only.js';
import { MULTI_CHAIN_WATCH_ONLY_PREFIX_COINS } from './multi-chain-profile.js';

export function detectBitcoinWatchOnly(raw: string, mode: { auto: boolean }): DetectedWatchOnlyMaterial {
  const trimmed = raw.trim();
  const matched = matchExplicitPrefix(trimmed);
  if (matched !== null) {
    if (matched.prefix === 'bitcoin-xpub') {
      if (!matched.value) throw new Error('bitcoin-xpub: requires a value.');
      const slip132 = parseBitcoinSlip132(matched.value);
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
  const descriptor = parseBitcoinWatchDescriptor(trimmed);
  if (descriptor !== null) {
    return {
      coinId: 'bitcoin',
      kind: 'bitcoin-descriptor',
      value: trimmed,
      detectionLabel: `Bitcoin ${bitcoinWatchModeLabel(descriptor.mode)} · exact descriptor`,
    };
  }
  const slip132 = parseBitcoinSlip132(trimmed);
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
