import { bech32m, createBase58check } from '@scure/base';
import { sha256 } from '@noble/hashes/sha2.js';
import type { NetworkName } from '@ckd/core/types.js';
import type { WalletMatcherTarget } from './matcher-types.js';

const base58check = createBase58check(sha256);
const ALL_DASH_ADDRESS_ADAPTERS = [
  'dash-core',
  'dash-legacy-mobile',
  'dash-core-coinjoin',
  'dash-platform',
  'dash-shielded',
] as const;

function detectDashAddress(
  address: string,
  network: NetworkName,
): { readonly normalized: string; readonly adapters: readonly string[] } | null {
  try {
    const payload = base58check.decode(address);
    const expected = network === 'mainnet' ? 76 : 140;
    if (payload.length === 21 && payload[0] === expected) {
      return {
        normalized: address,
        adapters: ['dash-core', 'dash-legacy-mobile', 'dash-core-coinjoin'],
      };
    }
  } catch {
    // A valid Platform or Orchard address is Bech32m rather than Base58Check.
  }
  try {
    const decoded = bech32m.decode(address, 200);
    const expectedHrp = network === 'mainnet' ? 'dash' : 'tdash';
    if (decoded.prefix !== expectedHrp) return null;
    const payload = bech32m.fromWords(decoded.words);
    if (payload[0] === 0xb0 && payload.length === 21) {
      return { normalized: address.toLowerCase(), adapters: ['dash-platform'] };
    }
    if (payload[0] === 0x10 && payload.length === 44) {
      return { normalized: address.toLowerCase(), adapters: ['dash-shielded'] };
    }
  } catch {
    // Report the common validation error below.
  }
  return null;
}

export function detectDashMatcherTargets(
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
    const detected = detectDashAddress(value, network);
    if (detected === null)
      throw new Error(`Address ${index + 1} is not a valid Dash address for the selected network.`);
    const { normalized, adapters } = detected;
    if (seen.has(normalized)) throw new Error(`Address ${index + 1} duplicates an earlier address.`);
    seen.add(normalized);
    return {
      id: `address-${index + 1}`,
      input: value,
      normalized,
      network,
      adapterIds: forceAllProfiles ? ALL_DASH_ADDRESS_ADAPTERS : adapters,
    };
  });
}
