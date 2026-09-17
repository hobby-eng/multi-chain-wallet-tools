import type { CoinAdapter } from '@ckd/coins/registry.js';
import type { DerivationControlValues, SharedDerivationControlValues } from './inputs.js';

/** Keeps user-entered ranges stable while switching protocol variants. */
export class AdapterSettingsStore {
  readonly #lastVariantByCoin = new Map<string, string>();
  readonly #settingsByAdapter = new Map<string, DerivationControlValues>();
  readonly #sharedByCoin = new Map<string, SharedDerivationControlValues>();
  readonly #includeChangeByCoin = new Map<string, boolean>();
  readonly #includeCoinJoinByCoin = new Map<string, boolean>();

  constructor(readonly familyId: (adapter: CoinAdapter) => string) {}

  remember(adapter: CoinAdapter, values: DerivationControlValues): void {
    const family = this.familyId(adapter);
    this.#settingsByAdapter.set(adapter.id, values);
    this.#sharedByCoin.set(family, {
      network: values.network,
      account: values.account,
      start: values.start,
      count: values.count,
    });
    if (adapter.addressBranches !== undefined) this.#includeChangeByCoin.set(family, values.includeChange);
    if (adapter.coinJoin !== undefined) this.#includeCoinJoinByCoin.set(family, values.includeCoinJoin);
  }

  selectVariant(adapter: CoinAdapter): void {
    this.#lastVariantByCoin.set(this.familyId(adapter), adapter.id);
  }

  variantForFamily(familyId: string): string | undefined {
    return this.#lastVariantByCoin.get(familyId);
  }

  controlsFor(adapter: CoinAdapter): {
    readonly values: DerivationControlValues;
    readonly shared: SharedDerivationControlValues | undefined;
  } {
    const family = this.familyId(adapter);
    const remembered = this.#settingsByAdapter.get(adapter.id);
    const values = remembered ?? { ...adapter.defaults, includeChange: false, includeCoinJoin: false };
    return {
      values: {
        ...values,
        includeChange:
          adapter.addressBranches === undefined
            ? false
            : (this.#includeChangeByCoin.get(family) ?? remembered?.includeChange ?? false),
        includeCoinJoin:
          adapter.coinJoin === undefined
            ? false
            : (this.#includeCoinJoinByCoin.get(family) ?? remembered?.includeCoinJoin ?? false),
      },
      shared: this.#sharedByCoin.get(family),
    };
  }

  clear(): void {
    this.#lastVariantByCoin.clear();
    this.#settingsByAdapter.clear();
    this.#sharedByCoin.clear();
    this.#includeChangeByCoin.clear();
    this.#includeCoinJoinByCoin.clear();
  }
}
