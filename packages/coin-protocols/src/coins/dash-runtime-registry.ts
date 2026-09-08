import type { DerivationResult } from '@ckd/core/types.js';
import { deriveDashCoinJoin } from './dash/coinjoin.js';
import { deriveDashCore } from './dash/core.js';
import { deriveDashLegacyMobile } from './dash/legacy-mobile.js';
import { deriveDashIdentity } from './dash/identity.js';
import { deriveDashPlatform } from './dash/platform.js';
import { getCoinAdapter, type CoinAdapter, type CoinDerivationInput } from './dash-registry.js';

export interface RuntimeCoinAdapter extends CoinAdapter {
  derive(input: CoinDerivationInput): DerivationResult | Promise<DerivationResult>;
}

export function getRuntimeCoinAdapter(id: string): RuntimeCoinAdapter {
  // The DIP9 CoinJoin chain reuses Dash Core's account/network controls but
  // derives from an entirely separate path template, so it is dispatched
  // under its own worker id without becoming a selectable protocol tab.
  if (id === 'dash-core-coinjoin') return { ...getCoinAdapter('dash-core'), id, derive: deriveDashCoinJoin };
  const metadata = getCoinAdapter(id);
  if (id === 'dash-core') return { ...metadata, derive: deriveDashCore };
  if (id === 'dash-legacy-mobile') return { ...metadata, derive: deriveDashLegacyMobile };
  if (id === 'dash-platform') return { ...metadata, derive: deriveDashPlatform };
  if (id === 'dash-identity') return { ...metadata, derive: deriveDashIdentity };
  if (id === 'dash-shielded') {
    return {
      ...metadata,
      derive: async (input) => {
        const { deriveDashShielded } = await import('./dash/shielded.js');
        return deriveDashShielded(input);
      },
    };
  }
  throw new Error(`Unsupported Dash derivation protocol: ${id}.`);
}
