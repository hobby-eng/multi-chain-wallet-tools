import type { NetworkName } from "@ckd/core/types.js";

export interface WalletMatcherTarget {
  readonly id: string;
  readonly input: string;
  readonly normalized: string;
  readonly network: NetworkName;
  readonly adapterIds: readonly string[];
  /** When present, compare these derived public fields instead of a payment address. */
  readonly fieldKeys?: readonly string[];
  /**
   * When present, the only branches whose rows can show the address, such as Cardano's roles: the
   * receive ones always, the change ones only when change addresses are searched. Such a target
   * keeps its own adapters in a search of every coin.
   */
  readonly branches?: TargetBranches;
}

/** The branches of a target's rows: receive ones, and change ones searched only on request. */
export interface TargetBranches {
  readonly receive: readonly number[];
  readonly change: readonly number[];
}

export type WalletMatcherTargetDetector = (
  input: string,
  network: NetworkName,
  forceAllProfiles: boolean,
) => WalletMatcherTarget[];
