import type { CoinAdapter, CoinRegistry } from '@ckd/coins/registry-base.js';
import type { NetworkName } from '@ckd/core/types.js';
import type { WalletMatcherTarget, WalletMatcherTargetDetector } from '@ckd/recovery/matcher-types.js';

/** Scope the detector's build-compatible address profiles to the selected coin. */
export function matcherSearchTargets(
  input: string,
  network: NetworkName,
  detector: WalletMatcherTargetDetector,
  registry: CoinRegistry,
  coinId: string,
  allCoins: boolean,
): WalletMatcherTarget[] {
  const familyFor = (adapterId: string): string | undefined => {
    const id = adapterId === 'dash-core-coinjoin' ? 'dash-core' : adapterId;
    const adapter = registry.COIN_ADAPTERS.find((candidate) => candidate.id === id);
    return adapter === undefined ? undefined : registry.getAdapterFamilyId(adapter);
  };
  if (!allCoins) {
    const family = registry.getCoinFamily(coinId);
    for (const target of detector(input, network, false)) {
      if (!target.adapterIds.some((id) => familyFor(id) === coinId)) {
        throw new Error(
          `Target ${target.id.replace('address-', '')} does not belong to ${family.label}. Select its coin or enable searching every supported coin.`,
        );
      }
    }
  }
  return detector(input, network, true).map((target) => {
    const adapterIds = target.adapterIds.filter((id) => {
      const family = familyFor(id);
      return family !== undefined && (allCoins || family === coinId);
    });
    if (adapterIds.length === 0) throw new Error('No compatible search profiles are available for the selected coin.');
    return { ...target, adapterIds };
  });
}

/** Only address adapters with explicit receive/change metadata gain a change branch.
 * Other branch options (for example Ethereum alternate paths) retain their existing scope.
 */
export function matcherSearchBranches(
  adapter: CoinAdapter,
  includeChange: boolean,
  allCoins = false,
): readonly number[] {
  const searchChange = includeChange || allCoins;
  if (adapter.id === 'dash-core-coinjoin' && adapter.coinJoin !== undefined) {
    const { external, internal } = adapter.coinJoin.branches;
    return searchChange ? [external, internal] : [external];
  }
  if (adapter.addressBranches !== undefined) {
    const { receive, change } = adapter.addressBranches;
    return searchChange ? [receive, change] : [receive];
  }
  if (adapter.branchControl?.options !== undefined) return adapter.branchControl.options.map(({ value }) => value);
  return [adapter.defaults.branch];
}
