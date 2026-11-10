import type { CoinAdapter } from "@ckd/coins/registry.js";
import type { DerivationControlValues, SharedDerivationControlValues } from "./inputs.js";

/** Keeps user-entered ranges stable while switching protocol variants. */
export class AdapterSettingsStore {
  readonly #lastVariantByCoin = new Map<string, string>();
  readonly #settingsByAdapter = new Map<string, DerivationControlValues>();
  readonly #sharedByCoin = new Map<string, SharedDerivationControlValues>();
  readonly #includeChangeByCoin = new Map<string, boolean>();
  readonly #includeCoinJoinByCoin = new Map<string, boolean>();
  readonly #familyId: (adapter: CoinAdapter) => string;

  constructor(familyId: (adapter: CoinAdapter) => string) {
    this.#familyId = familyId;
  }

  /** Snapshot admitted settings; later edits to a caller's object cannot change the saved variant. */
  remember(adapter: CoinAdapter, values: DerivationControlValues): void {
    const family = this.#familyId(adapter);
    this.#settingsByAdapter.set(adapter.id, { ...values });
    // A protocol of one key has no range to share with its coin's other variants.
    if (adapter.rangeControl !== false)
      this.#sharedByCoin.set(family, {
        network: values.network,
        account: values.account,
        start: values.start,
        count: values.count,
      });
    if (adapter.addressBranches !== undefined)
      this.#includeChangeByCoin.set(family, values.includeChange);
    if (adapter.coinJoin !== undefined)
      this.#includeCoinJoinByCoin.set(family, values.includeCoinJoin);
  }

  /** Remember the protocol selected in one coin family. */
  selectVariant(adapter: CoinAdapter): void {
    this.#lastVariantByCoin.set(this.#familyId(adapter), adapter.id);
  }

  /** Most recently selected protocol of the requested family, when one was selected. */
  variantForFamily(familyId: string): string | undefined {
    return this.#lastVariantByCoin.get(familyId);
  }

  /** Fresh settings for a protocol, applying only the controls shared by its coin family. */
  controlsFor(adapter: CoinAdapter): {
    readonly values: DerivationControlValues;
    readonly shared: SharedDerivationControlValues | undefined;
  } {
    const family = this.#familyId(adapter);
    const remembered = this.#settingsByAdapter.get(adapter.id);
    const shared = this.#sharedByCoin.get(family);
    const values = remembered ?? {
      ...adapter.defaults,
      includeChange: false,
      includeCoinJoin: false,
    };
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
      shared: shared === undefined ? undefined : { ...shared },
    };
  }

  /** Forget every remembered variant and range. */
  clear(): void {
    this.#lastVariantByCoin.clear();
    this.#settingsByAdapter.clear();
    this.#sharedByCoin.clear();
    this.#includeChangeByCoin.clear();
    this.#includeCoinJoinByCoin.clear();
  }
}
