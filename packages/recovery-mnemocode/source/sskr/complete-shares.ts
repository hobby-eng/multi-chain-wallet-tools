// The restore of a set of complete SSKR shares, in which every share given is checked against the
// phrase: the one check for shares typed whole (ShareSet.restore, share-set.ts) and for shares that
// a joint repair filled in (joint-repair.ts). Not a part of its own: it sits below both, which
// could not import each other.
//
// Needs from the host: a SharePlatform whose combineShares is the host's SSKR library.

import { entropyToMnemonic } from "@scure/bip39";
import { englishWordlist as wordlist } from "../core/english-words.js";
import { BIP39_ENTROPY_BYTES } from "../core/bip39-sizes.js";
import { SetTopology, surplusWindow } from "./set-topology.js";
import { MIN_DIGEST_THRESHOLD } from "./share-layout.js";
import type { SharePlatform } from "./share-platform.js";
import { Share } from "./transport.js";
import { equalBytes } from "../core/bits.js";
import { placeOf } from "../core/places.js";
import { defined } from "../core/defined.js";
import { ErrorCatalog, suppliedMessage } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("sskr.complete-shares", {
  "no-secret": () => NO_SECRET,
  "too-many-failing": () => TOO_MANY_FAILING,
  "recovered-sskr-secret-not-bip39-entropy": () => "Recovered SSKR secret is not BIP39 entropy.",
  "operation-refused": suppliedMessage,
});

/**
 * Choices of groups tried as the reference: about a second of recoveries for the largest sets.
 * Only a set of 13 groups or more has more choices than this (13 choose 6 is 1716).
 */
const MAX_REFERENCE_TRIES = 2 ** 10;
const UNCHECKED_DISAGREEMENT =
  "These shares give different secrets, and none of them can be checked on its own: MnemoCode cannot tell which is wrong. Check each of them.";
const NO_SECRET =
  "These shares do not restore a secret: check them, and that all belong to one set.";
const TOO_MANY_FAILING =
  "Too many combinations of these groups fail to restore a secret: leave out the groups you doubt, or check them.";

/** A group: the indexes of its shares in the input, counted from 0. */
type Group = readonly number[];

/** The groups that the secret is restored from, that secret, and whether a digest checks it. */
interface Reference {
  readonly groups: readonly Group[];
  readonly entropy: Uint8Array;
  readonly checked: boolean;
}

/** Every choice of `count` of `items`, in their order: [a, b], [a, c], …, [b, c], … */
function* choicesOf<T>(items: readonly T[], count: number, from = 0): Generator<T[]> {
  if (count === 0) {
    yield [];
    return;
  }
  for (let at = from; at <= items.length - count; at += 1)
    for (const rest of choicesOf(items, count - 1, at + 1)) yield [defined(items[at]), ...rest];
}

/**
 * The groups whose secret every other share is compared with: the first choice, in input order,
 * that a digest checks and that restores. A digest must check it: otherwise a wrong share that
 * comes first would be trusted, the right ones blamed, and leaving those out would restore a wrong
 * phrase. A choice that fails is passed over, so that a wrong group is blamed instead of the whole
 * set refused. With a group threshold of 2 or more, the digest of the groups checks any choice;
 * with 1, a group checks itself when its member threshold is 2 or more. When no group can be
 * checked, the first is taken, and a share that disagrees with it is not blamed.
 */
async function referenceOf(
  complete: readonly Group[],
  groupThreshold: number,
  memberThreshold: (group: Group) => number,
  restore: (groups: readonly Group[]) => Promise<Uint8Array | undefined>,
): Promise<Reference> {
  const checkable = complete.filter((group) => memberThreshold(group) >= MIN_DIGEST_THRESHOLD);
  if (groupThreshold < MIN_DIGEST_THRESHOLD && checkable.length === 0) {
    const entropy = await restore(complete.slice(0, 1));
    if (entropy === undefined) throw ERRORS.create("no-secret", []);
    return { groups: complete.slice(0, 1), entropy, checked: false };
  }
  const choices =
    groupThreshold >= MIN_DIGEST_THRESHOLD
      ? choicesOf(complete, groupThreshold)
      : checkable.map((group) => [group]);
  let tries = 0;
  for (const groups of choices) {
    if (tries === MAX_REFERENCE_TRIES) throw ERRORS.create("too-many-failing", []);
    tries += 1;
    const entropy = await restore(groups);
    if (entropy !== undefined) return { groups, entropy, checked: true };
  }
  // A group of member threshold 1 may still restore, unchecked: no share is named, so that no
  // refusal leads there.
  throw ERRORS.create("no-secret", []);
}

/**
 * A refusal of the members of a group that give another secret than the reference, each named by
 * its place in `places`, by its index (counted from 0) among the shares given.
 */
function otherGroupMismatch(members: readonly number[], places?: readonly number[]): string {
  const numbers = members.map((member) => placeOf(places, member + 1)).join(", ");
  return members.length === 1
    ? `Share ${numbers} of another group does not fit with the others: leave it out, or check it.`
    : `Shares ${numbers} of another group do not fit with the others: leave them out, or check them.`;
}

/**
 * The refusal of the share at `place` without which the others restore one phrase: with it they
 * give another phrase or none. The restore of complete shares says it of a surplus member, and
 * the shares as typed (share-input.ts) of the share that they find by leaving each out once.
 */
export function misfitMessage(place: number): string {
  return `Share ${place} does not fit with the others: with it they give another phrase or none. Leave it out, or check it.`;
}

/**
 * The `unchecked` field of a restored set (RepairedSet.unchecked) from the indexes, counted from 0,
 * of the shares that took no part in its check: counted from 1, as a set names its shares, and no
 * field at all when every share took part. ShareSet.restore and a joint repair both give it so.
 */
export function uncheckedField(unchecked: readonly number[]): {
  readonly unchecked?: readonly number[];
} {
  return unchecked.length === 0 ? {} : { unchecked: unchecked.map((index) => index + 1) };
}

/**
 * Restores the phrase from complete shares and checks that every share given agrees with it. The
 * SSKR library uses only the first `threshold` members of a group and the first groups that meet
 * the group threshold, so a surplus share would go unchecked, even a wrong one with a valid
 * checksum (AUD-008-FUN001). Each surplus member, and each surplus group, is therefore used once in
 * place of a member or a group of the reference (referenceOf), and must give the same secret. The
 * shares of a group with fewer members than its threshold take no part and cannot be checked: they
 * are returned, counted from 0. A refusal names each share by its place in `places`, by its index;
 * by its index, counted from 1, without them.
 */
export async function restoreCompleteShares(
  records: readonly string[],
  platform: SharePlatform,
  places?: readonly number[],
): Promise<{ readonly mnemonic: string; readonly unchecked: readonly number[] }> {
  const shares = Share.readSet(records);
  const normalized = shares.map((share) => share.ur);
  const infos = shares.map((share) => share.info);
  const topology = new SetTopology(infos);
  const threshold = (group: Group) => topology.thresholdOf(group);
  const { complete } = topology;
  const unchecked = topology.incomplete;
  const firstMembers = (group: Group) => group.slice(0, threshold(group));
  /** The entropy that the SSKR library restores from `members`, or undefined when it refuses. */
  const recoverWith = async (members: readonly number[]): Promise<Uint8Array | undefined> => {
    try {
      return await platform.combineShares(members.map((member) => defined(normalized[member])));
    } catch {
      return undefined;
    }
  };
  const reference = await referenceOf(
    complete,
    defined(infos[0]).groupThreshold,
    threshold,
    (choice) => recoverWith(choice.flatMap(firstMembers)),
  );
  const { groups: used, entropy } = reference;
  try {
    if (!BIP39_ENTROPY_BYTES.includes(entropy.length))
      throw ERRORS.create("recovered-sskr-secret-not-bip39-entropy", []);
    /** The secret with `group` in place of one of the groups used: its own place, or the last. */
    const agrees = async (group: Group, members: readonly number[]): Promise<boolean> => {
      const at = used.includes(group) ? used.indexOf(group) : used.length - 1;
      const set = used.map((other, index) => (index === at ? members : firstMembers(other)));
      const again = await recoverWith(set.flat());
      try {
        return again !== undefined && equalBytes(again, entropy);
      } finally {
        again?.fill(0);
      }
    };
    // Without a digest, a disagreement shows only that some share is wrong, not which one.
    const refuse = (message: string): never => {
      throw ERRORS.create("operation-refused", [
        reference.checked ? message : UNCHECKED_DISAGREEMENT,
      ]);
    };
    for (const group of complete) {
      const first = firstMembers(group);
      if (!used.includes(group) && !(await agrees(group, first)))
        refuse(otherGroupMismatch(first, places));
      for (const member of group.slice(first.length))
        if (!(await agrees(group, surplusWindow(first, member))))
          refuse(misfitMessage(placeOf(places, member + 1)));
    }
    return { mnemonic: entropyToMnemonic(entropy, wordlist), unchecked };
  } finally {
    entropy.fill(0);
  }
}
