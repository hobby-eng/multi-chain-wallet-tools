import type { NetworkName } from "@ckd/core/types.js";
import {
  assertAddressCount,
  assertIndex,
  BIP32_HARDENED_OFFSET,
  MAX_BIP32_INDEX,
} from "@ckd/core/bip32-limits.js";
import { BIP44_ADDRESS_BRANCHES, indexRange } from "./coins/registry-base.js";

export interface PathAccount {
  readonly network: NetworkName;
  readonly account: number;
}

export interface PathBranch extends PathAccount {
  readonly branch: number;
}

export interface PathRange extends PathBranch {
  readonly start: number;
  readonly count: number;
}

/** Path previews can span many worker batches, but may not cross the index domain. */
export function assertPathRange(start: number, count: number, max = MAX_BIP32_INDEX): void {
  assertIndex(start, "Start index", max);
  assertAddressCount(count, "Number of results");
  if (count - 1 > max - start) throw new Error(`The requested path range exceeds index ${max}.`);
}

/** Crypto-free account layout shared by protocol previews and key derivation. */
export class DerivationPathProfile {
  readonly #account: (input: PathAccount) => string;
  readonly #hardenedBranch: boolean;

  constructor(account: (input: PathAccount) => string, hardenedBranch = false) {
    this.#account = account;
    this.#hardenedBranch = hardenedBranch;
  }

  accountPath(input: PathAccount): string {
    assertIndex(input.account, "Account");
    return this.#account(input);
  }

  branchPath(input: PathBranch): string {
    this.branchIndex(input.branch);
    return `${this.accountPath(input)}/${input.branch}${this.#hardenedBranch ? "'" : ""}`;
  }

  /** The encoded child index used by BIP32, including this profile's hardening. */
  branchIndex(branch: number): number {
    assertIndex(branch, "Branch", BIP44_ADDRESS_BRANCHES.change);
    return branch + (this.#hardenedBranch ? BIP32_HARDENED_OFFSET : 0);
  }

  addressPath(input: PathBranch, index: number): string {
    assertIndex(index, "Address index");
    return `${this.branchPath(input)}/${index}`;
  }

  pathPreview(input: PathRange): string {
    assertPathRange(input.start, input.count);
    return `${this.branchPath(input)}/${indexRange(input.start, input.count)}`;
  }
}
