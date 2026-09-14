import type { NetworkName } from '@ckd/core/types.js';
import { normalizeBitcoinAddress } from '@ckd/public-data-providers/address-normalization.js';

export type BitcoinAddressAdapterId =
  | 'bitcoin-legacy'
  | 'bitcoin-nested-segwit'
  | 'bitcoin-native-segwit'
  | 'bitcoin-taproot';

export interface AddressSearchTarget {
  readonly input: string;
  readonly normalized: string;
  readonly adapterId: BitcoinAddressAdapterId;
  readonly network: NetworkName;
}

function invalid(): never {
  throw new Error('Enter valid Bitcoin addresses for the selected network.');
}

export function detectBitcoinAddressTarget(value: string, network: NetworkName): AddressSearchTarget {
  const input = value.trim();
  if (input.length === 0) return invalid();
  let normalized: string;
  try {
    normalized = normalizeBitcoinAddress(input, network);
  } catch {
    return invalid();
  }
  if (network === 'mainnet') {
    if (/^1[1-9A-HJ-NP-Za-km-z]{25,34}$/u.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-legacy', network };
    if (/^3[1-9A-HJ-NP-Za-km-z]{25,34}$/u.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-nested-segwit', network };
    if (/^bc1q[ac-hj-np-z02-9]{38,87}$/iu.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-native-segwit', network };
    if (/^bc1p[ac-hj-np-z02-9]{58}$/iu.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-taproot', network };
  } else {
    if (/^(?:m|n)[1-9A-HJ-NP-Za-km-z]{25,34}$/u.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-legacy', network };
    if (/^2[1-9A-HJ-NP-Za-km-z]{25,34}$/u.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-nested-segwit', network };
    if (/^tb1q[ac-hj-np-z02-9]{38,87}$/iu.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-native-segwit', network };
    if (/^tb1p[ac-hj-np-z02-9]{58}$/iu.test(normalized))
      return { input, normalized, adapterId: 'bitcoin-taproot', network };
  }
  return invalid();
}

export function detectBitcoinAddressTargets(input: string, network: NetworkName): AddressSearchTarget[] {
  const values = input
    .replaceAll('\r', '')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) return invalid();
  const targets = values.map((value) => detectBitcoinAddressTarget(value, network));
  const seen = new Set<string>();
  return targets.filter((target) => !seen.has(target.normalized) && seen.add(target.normalized));
}
