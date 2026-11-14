import type { NetworkName } from "@ckd/core/types.js";

export interface WalletMatcherTarget {
  readonly id: string;
  readonly input: string;
  readonly normalized: string;
  readonly network: NetworkName;
  readonly adapterIds: readonly string[];
  /**
   * The adapters of the coin that read the address, when a search of every profile has widened
   * adapterIds beyond them; the selected coin is checked against these.
   */
  readonly coinAdapterIds?: readonly string[];
  /** When present, compare these derived public fields instead of a payment address. */
  readonly fieldKeys?: readonly string[];
  /**
   * When present, the only branches whose rows can show the address, such as Cardano's roles: the
   * receive ones always, the change ones only when change addresses are searched. Such a target
   * keeps its own adapters in a search of every coin.
   */
  readonly branches?: TargetBranches;
  /**
   * When present, an address that no row of the index range shows is then tested by ownership
   * (address-search.ts ResultTarget.ownership), at any index that each searched account's rows can
   * have. Such a target keeps its own adapters in a search of every coin.
   */
  readonly ownership?: true;
  /**
   * When present, the costly part of the address's checks, which recognition leaves for later (a
   * Zcash Sapling receiver's point checks, a few milliseconds each): the plan makes it once per
   * search, in turns of the host, before any seed is made. It throws, naming the address's line,
   * for an address it refuses.
   */
  readonly check?: () => void;
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
