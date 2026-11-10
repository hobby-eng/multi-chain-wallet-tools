// The names every variant of a single-key coin has, whatever derives its keys, and the lookup of a
// variant's derivation by adapter id. Crypto-free.
import type { Bip32BatchOptions, DerivationResult } from "@ckd/core/types.js";

/** The names of one variant of a coin. */
export interface CoinVariantFacts {
  /** The adapter's id, such as "litecoin-native-segwit". */
  readonly adapterId: string;
  /** The coin's family name in the Coin menu, such as "Litecoin". */
  readonly group: string;
  /** The variant's name in the Derivation type tabs, such as "Native SegWit · BIP84". */
  readonly variantLabel: string;
  readonly defaultVariant?: boolean;
}

/** One variant of a coin, by its names; each kind of profile adds its paths. */
export class CoinVariant {
  readonly adapterId: string;
  readonly group: string;
  readonly variantLabel: string;
  readonly defaultVariant: boolean;

  constructor(facts: CoinVariantFacts) {
    this.adapterId = facts.adapterId;
    this.group = facts.group;
    this.variantLabel = facts.variantLabel;
    this.defaultVariant = facts.defaultVariant === true;
  }

  /** The adapter's full label, such as "Solana Ledger · m/44'/501'/i'". */
  get label(): string {
    return `${this.group} ${this.variantLabel}`;
  }
}

/** A variant's derivation of a batch of rows. */
export type VariantDerivation = (options: Bip32BatchOptions) => DerivationResult;

/** The derivation of the variant among `profiles` with adapter id `id`; undefined for another id. */
export function variantDerivation<Profile extends CoinVariant>(
  profiles: readonly Profile[],
  id: string,
  derive: (profile: Profile, options: Bip32BatchOptions) => DerivationResult,
): VariantDerivation | undefined {
  const profile = profiles.find((candidate) => candidate.adapterId === id);
  return profile === undefined ? undefined : (options) => derive(profile, options);
}
