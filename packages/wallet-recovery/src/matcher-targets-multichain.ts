import type { NetworkName } from '@ckd/core/types.js';
import { detectBitcoinAddressTarget } from './address-targets.js';
import { detectDashMatcherTargets } from './matcher-targets-dash.js';
import type { WalletMatcherTarget } from './matcher-types.js';

const ALL_ADDRESS_ADAPTERS = [
  'bitcoin-legacy',
  'bitcoin-nested-segwit',
  'bitcoin-native-segwit',
  'bitcoin-taproot',
  'ethereum',
  'dash-core',
  'dash-legacy-mobile',
  'dash-core-coinjoin',
  'dash-platform',
  'dash-shielded',
] as const;

function detectOne(value: string, network: NetworkName): Omit<WalletMatcherTarget, 'id'> {
  if (/^0x[0-9a-f]{40}$/iu.test(value)) {
    return { input: value, normalized: value.toLowerCase(), network, adapterIds: ['ethereum'] };
  }
  try {
    const bitcoin = detectBitcoinAddressTarget(value, network);
    return { input: value, normalized: bitcoin.normalized, network, adapterIds: [bitcoin.adapterId] };
  } catch {
    const [dash] = detectDashMatcherTargets(value, network, false);
    if (dash !== undefined) return dash;
  }
  throw new Error('The address is not recognized as Bitcoin, Ethereum, or Dash for the selected network.');
}

export function detectMultiChainMatcherTargets(
  input: string,
  network: NetworkName,
  forceAllProfiles: boolean,
): WalletMatcherTarget[] {
  const values = input
    .replaceAll('\r', '')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) throw new Error('Enter at least one known address.');
  const seen = new Set<string>();
  return values.map((value, index) => {
    let detected: Omit<WalletMatcherTarget, 'id'>;
    try {
      detected = detectOne(value, network);
    } catch {
      throw new Error(`Address ${index + 1} is not recognized for the selected network.`);
    }
    if (seen.has(detected.normalized)) throw new Error(`Address ${index + 1} duplicates an earlier address.`);
    seen.add(detected.normalized);
    return {
      ...detected,
      id: `address-${index + 1}`,
      adapterIds: forceAllProfiles && detected.fieldKeys === undefined ? ALL_ADDRESS_ADAPTERS : detected.adapterIds,
    };
  });
}
