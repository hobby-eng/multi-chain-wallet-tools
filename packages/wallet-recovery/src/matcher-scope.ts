import { ErrorCatalog } from "@ckd/core/error-catalog.js";
import {
  resolveCoinProtocol,
  type CoinAdapter,
  type CoinRegistry,
} from "@ckd/coins/registry-base.js";
import type { NetworkName } from "@ckd/core/types.js";
import type { WalletMatcherTarget, WalletMatcherTargetDetector } from "./matcher-types.js";

const ERRORS = new ErrorCatalog("wallet.matcher-scope", {
  coin: (place: number, label: string) =>
    `Target ${place} does not belong to ${label}. Select its coin or enable searching every supported coin.`,
  profiles: () => "No compatible search profiles are available for the selected coin.",
});

/** Coin/profile and receive/change admission shared by Matcher hosts. */
export class MatcherScope {
  /** Scope the detector's build-compatible address profiles to the selected coin. */
  static targets(
    input: string,
    network: NetworkName,
    detector: WalletMatcherTargetDetector,
    registry: CoinRegistry,
    coinId: string,
    allCoins: boolean,
  ): WalletMatcherTarget[] {
    const familyFor = (adapterId: string): string | undefined => {
      const adapter = resolveCoinProtocol(registry, adapterId);
      return adapter === undefined ? undefined : registry.getAdapterFamilyId(adapter);
    };
    if (!allCoins) {
      const family = registry.getCoinFamily(coinId);
      for (const [place, target] of detector(input, network, false).entries()) {
        if (!target.adapterIds.some((id) => familyFor(id) === coinId)) {
          throw ERRORS.create("coin", [place + 1, family.label]);
        }
      }
    }
    return detector(input, network, true).map((target) => {
      const adapterIds = target.adapterIds.filter((id) => {
        const family = familyFor(id);
        return family !== undefined && (allCoins || family === coinId);
      });
      if (adapterIds.length === 0) throw ERRORS.create("profiles", []);
      return { ...target, adapterIds };
    });
  }

  /** Only address adapters with explicit receive/change metadata gain a change branch.
   * Other branch options (for example Ethereum alternate paths) retain their existing scope.
   */
  static branches(
    adapter: CoinAdapter,
    includeChange: boolean,
    allCoins = false,
  ): readonly number[] {
    const searchChange = includeChange || allCoins;
    if (adapter.addressBranches !== undefined) {
      const { receive, change } = adapter.addressBranches;
      return searchChange ? [receive, change] : [receive];
    }
    if (adapter.branchControl?.options !== undefined)
      return adapter.branchControl.options.map(({ value }) => value);
    return [adapter.defaults.branch];
  }
}
