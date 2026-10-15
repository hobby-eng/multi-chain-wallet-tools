// The scan of a wallet's addresses that every address check shares: the key at a path, derived
// with every node on the way wiped, the keys of a branch derived one step each from the branch's
// key, and how many addresses in a row a person compares when unsure which one they have. Every
// key derived is wiped once compared.
//
// It also reads, as a person types them, the place of an address (account, branch, index), which
// a page's fields read through it (parsePlaceNumber), and how many are compared, which the command
// line's questions and a page read through it (parseAddressCount).
//
// Host-neutral, with @scure/bip32 (test/portable-modules.test.ts).

import type { HDKey } from "@scure/bip32";
import { HARDENED_OFFSET, LAST_NORMAL_INDEX, NORMAL_INDEX_RANGE } from "./bip32-limits.js";
import { inWholeRange, typedWholeNumber, type WholeRange, integerRefusal } from "./typed-number.js";
import { ErrorCatalog, suppliedMessage } from "./error-catalog.js";

const ERRORS = new ErrorCatalog("core.address-scan", {
  "address-count-refused": suppliedMessage,
  "addresses-compared-would-pass-index": (value0: string) =>
    `The addresses compared would pass index ${value0}.`,
  "unable-derive-public-key": () => "Unable to derive the public key.",
});

export { LAST_NORMAL_INDEX };

/**
 * How many addresses a person compares when unsure which one they have: the first 20, BIP44's gap
 * limit, after which a wallet stops looking for used addresses.
 */
export const DEFAULT_ADDRESS_COUNT = 20;
/**
 * The most addresses one piece of evidence is compared with: every one costs a derivation in each
 * phrase that a search tries, and no wallet hands out more in a row without a used one between.
 */
export const MAX_ADDRESS_COUNT = 1_000;
/** How many addresses one piece of evidence is compared with: one through MAX_ADDRESS_COUNT. */
export const ADDRESS_COUNT_RANGE: WholeRange = Object.freeze({ min: 1, max: MAX_ADDRESS_COUNT });

/**
 * The addresses compared from `first` on when the person names no number: the first 20
 * (DEFAULT_ADDRESS_COUNT), or as many as there are up to the last index.
 */
export function defaultAddressCount(first: number): number {
  return Math.max(1, Math.min(DEFAULT_ADDRESS_COUNT, LAST_NORMAL_INDEX - first + 1));
}

/**
 * An account, a branch or an index as typed: a whole number from 0 through LAST_NORMAL_INDEX,
 * leading zeros allowed; otherwise refused with a line that says what fits.
 */
export function parsePlaceNumber(answer: string): number {
  return typedWholeNumber(answer, NORMAL_INDEX_RANGE);
}

/**
 * How many addresses are compared, as typed: a whole number from 1 through MAX_ADDRESS_COUNT,
 * leading zeros allowed, which from `first` on stays below the hardened indexes (addressCount).
 */
export function parseAddressCount(answer: string, first = 0): number {
  return addressCount(typedWholeNumber(answer, ADDRESS_COUNT_RANGE), first);
}

/** What a check derives from a node and its public key when it is the evidence's key. */
export type KeyMatch = (node: HDKey, publicKey: Uint8Array) => string | undefined;

/** A key that matched, as shown, and where it is. */
export interface FoundKey {
  readonly derived: string;
  readonly path: string;
}

/** The addresses of a branch that are compared: `count` of them from index `first` on. */
export interface AddressRange {
  readonly first: number;
  readonly count: number;
}

/**
 * How many addresses are compared from `first` on: `requested`, or one when it is left out;
 * refused unless it is a whole number from 1 through MAX_ADDRESS_COUNT that ends at an index of
 * BIP32 that is not hardened.
 */
export function addressCount(requested: number | undefined, first: number): number {
  if (!inWholeRange(first, NORMAL_INDEX_RANGE))
    throw ERRORS.create("address-count-refused", [
      integerRefusal("The first index", NORMAL_INDEX_RANGE),
    ]);
  if (requested === undefined) return 1;
  if (!inWholeRange(requested, ADDRESS_COUNT_RANGE))
    throw ERRORS.create("address-count-refused", [
      integerRefusal("The number of addresses compared", ADDRESS_COUNT_RANGE),
    ]);
  if (first + requested - 1 > LAST_NORMAL_INDEX)
    throw ERRORS.create("addresses-compared-would-pass-index", [`${LAST_NORMAL_INDEX}`]);
  return requested;
}

/** The key at `path` compared by `matchOf`; it is wiped once compared. */
export function matchAtPath(root: HDKey, path: string, matchOf: KeyMatch): FoundKey | undefined {
  const derived = matchWiping(deriveWiping(root, path), matchOf);
  return derived === undefined ? undefined : { derived, path };
}

/** What `matchOf` says of `node`, which is wiped once compared, whatever the comparison does. */
function matchWiping(node: HDKey, matchOf: KeyMatch): string | undefined {
  try {
    return matchOf(node, publicKeyOf(node));
  } finally {
    node.wipePrivateData();
  }
}

/**
 * The first of the addresses in `range` below the branch at `branchPath` that `matchOf` matches.
 * The branch's key is derived once and each address's key from it in one step; every key is wiped
 * once compared, and the branch's at the end.
 */
export function scanBranch(
  root: HDKey,
  branchPath: string,
  range: AddressRange,
  matchOf: KeyMatch,
): FoundKey | undefined {
  const { first, count } = range;
  addressCount(count, first);
  const branch = deriveWiping(root, branchPath);
  try {
    for (let index = first; index < first + count; index += 1) {
      const derived = matchWiping(branch.deriveChild(index), matchOf);
      if (derived !== undefined) return { derived, path: `${branchPath}/${index}` };
    }
    return undefined;
  } finally {
    branch.wipePrivateData();
  }
}

/**
 * The node at `path`, a path such as m/84'/0'/0'/0/0, below `root`. Each node on the way is wiped
 * as soon as its child exists: HDKey.derive keeps them, the account's private key among them,
 * until they are collected. The caller wipes the node returned, and the root.
 */
export function deriveWiping(root: HDKey, path: string): HDKey {
  let node = root;
  try {
    for (const step of path.split("/").slice(1)) {
      // A step such as 84' is hardened: BIP32 adds 2^31 to its index.
      const index = Number.parseInt(step, 10) + (step.endsWith("'") ? HARDENED_OFFSET : 0);
      const child = node.deriveChild(index);
      if (node !== root) node.wipePrivateData();
      node = child;
    }
    return node;
  } catch (error) {
    if (node !== root) node.wipePrivateData();
    throw error;
  }
}

function publicKeyOf(node: HDKey): Uint8Array {
  const publicKey = node.publicKey;
  if (publicKey === null) throw ERRORS.create("unable-derive-public-key", []);
  return publicKey;
}
