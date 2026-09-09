import type { DerivationResult } from '@ckd/core/types.js';
import { deriveBitcoin, type BitcoinMode } from './bitcoin/index.js';
import { deriveDashCoinJoin } from './dash/coinjoin.js';
import { deriveDashCore } from './dash/core.js';
import { deriveDashLegacyMobile } from './dash/legacy-mobile.js';
import { deriveDashIdentity } from './dash/identity.js';
import { deriveDashPlatform } from './dash/platform.js';
import { deriveEthereum } from './ethereum/index.js';
import { getCoinAdapter, type CoinAdapter, type CoinDerivationInput } from './registry.js';

export interface RuntimeCoinAdapter extends CoinAdapter {
  derive(input: CoinDerivationInput): DerivationResult | Promise<DerivationResult>;
}

const BITCOIN_MODES: Readonly<Record<string, BitcoinMode>> = {
  'bitcoin-legacy': 'legacy',
  'bitcoin-nested-segwit': 'nested-segwit',
  'bitcoin-native-segwit': 'native-segwit',
  'bitcoin-taproot': 'taproot',
};

function deriveForAdapter(
  adapterId: string,
): (input: CoinDerivationInput) => DerivationResult | Promise<DerivationResult> {
  const bitcoinMode = BITCOIN_MODES[adapterId];
  if (bitcoinMode !== undefined) return (input) => deriveBitcoin(bitcoinMode, input);
  if (adapterId === 'ethereum') return deriveEthereum;
  if (adapterId === 'dash-core') return deriveDashCore;
  if (adapterId === 'dash-legacy-mobile') return deriveDashLegacyMobile;
  if (adapterId === 'dash-platform') return deriveDashPlatform;
  if (adapterId === 'dash-identity') return deriveDashIdentity;
  if (adapterId === 'dash-shielded') {
    return async (input) => {
      const { deriveDashShielded } = await import('./dash/shielded.js');
      return deriveDashShielded(input);
    };
  }
  throw new Error(`Unsupported derivation protocol: ${adapterId}.`);
}

/** Runtime registry. Import this only inside isolated derivation workers or tests. */
export function getRuntimeCoinAdapter(id: string): RuntimeCoinAdapter {
  // The DIP9 CoinJoin chain reuses Dash Core's account/network controls but
  // derives from an entirely separate path template, so it is dispatched
  // under its own worker id without becoming a selectable protocol tab.
  if (id === 'dash-core-coinjoin') return { ...getCoinAdapter('dash-core'), id, derive: deriveDashCoinJoin };
  const metadata = getCoinAdapter(id);
  return { ...metadata, derive: deriveForAdapter(id) };
}
