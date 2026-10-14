// The facts of a set of SSKR shares that every reader of shares derives from their metadata: which
// set a share is of, which member, the groups with their thresholds, which groups are complete and
// whether they are enough, and the first two shares that cannot both be right. The command line,
// the restore of complete shares and the reading of typed shares each answer a conflict in their
// own way: a refusal, or a question that names the shares by their places.
//
// Needs from the host: nothing. Imports only the type of a share's metadata (transport.ts).

import type { ShareInfo } from "./transport.js";
import { defined } from "../core/defined.js";

/** Two shares that cannot both be right: `at`, and `with`, which came first. */
export interface SetConflict {
  /** Another set than the reference; the same member twice; or a group with two thresholds. */
  readonly kind: "set" | "member" | "threshold";
  readonly at: number;
  readonly with: number;
}

/**
 * How each kind of conflict is said: as a refusal that names no share, and as what two or more
 * shares named by their places are ("Shares 1 and 2 are of different sets"). The check of a set
 * before the SSKR library (transport.ts) and the shares as typed (share-input.ts) both word a
 * conflict from it.
 */
export const SET_CONFLICT_TEXTS: Readonly<
  Record<SetConflict["kind"], { readonly refusal: string; readonly between: string }>
> = Object.freeze({
  set: { refusal: "SSKR shares belong to different sets.", between: "are of different sets" },
  member: {
    refusal: "The same SSKR member was supplied more than once.",
    between: "are the same member of the set but differ",
  },
  threshold: {
    refusal: "Conflicting SSKR group thresholds.",
    between: "give their group different thresholds",
  },
});

/**
 * The groups of shares of one set, by their indexes in the list given. A class, so that the
 * partition is made once and every question about the groups is answered from it.
 */
export class SetTopology {
  readonly #infos: readonly ShareInfo[];
  /** The shares of each group, in the order the groups first come. */
  readonly #groups: readonly (readonly number[])[];

  /** The topology of `infos`, the shares of one set without conflicts (firstConflict). */
  constructor(infos: readonly ShareInfo[]) {
    this.#infos = infos;
    const groups = new Map<number, number[]>();
    infos.forEach((info, index) =>
      groups.set(info.groupIndex, [...(groups.get(info.groupIndex) ?? []), index]),
    );
    this.#groups = [...groups.values()];
  }

  /** What the shares of one set agree on: identifier, group threshold and count, secret length. */
  static setOf(info: ShareInfo): string {
    return [info.identifier, info.groupThreshold, info.groupCount, info.secretLength].join(":");
  }

  /** One member of a set, which no two different shares may be. */
  static memberOf(info: ShareInfo): string {
    return `${info.groupIndex}:${info.memberIndex}`;
  }

  /**
   * The first share, in order, that conflicts with one before it: of another set than share
   * `reference`, the same member as an earlier share, or a threshold for its group other than an
   * earlier share's. Undefined when there is none.
   */
  static firstConflict(infos: readonly ShareInfo[], reference = 0): SetConflict | undefined {
    const set = SetTopology.setOf(defined(infos[reference]));
    const members = new Map<string, number>();
    const firstOfGroup = new Map<number, number>();
    for (const [at, info] of infos.entries()) {
      if (SetTopology.setOf(info) !== set) return { kind: "set", at, with: reference };
      const same = members.get(SetTopology.memberOf(info));
      if (same !== undefined) return { kind: "member", at, with: same };
      members.set(SetTopology.memberOf(info), at);
      const first = firstOfGroup.get(info.groupIndex);
      if (first !== undefined && defined(infos[first]).memberThreshold !== info.memberThreshold)
        return { kind: "threshold", at, with: first };
      if (first === undefined) firstOfGroup.set(info.groupIndex, at);
    }
    return undefined;
  }

  /** The shares of each group, by index, in the order the groups first come. */
  get groups(): readonly (readonly number[])[] {
    return this.#groups;
  }

  /** The member threshold of `group`, which every share of it carries. */
  thresholdOf(group: readonly number[]): number {
    return defined(this.#infos[defined(group[0])]).memberThreshold;
  }

  /** The groups with at least as many members as their threshold. */
  get complete(): readonly (readonly number[])[] {
    return this.#groups.filter((group) => group.length >= this.thresholdOf(group));
  }

  /** The shares of groups with fewer members than their threshold, which take no part, in order. */
  get incomplete(): readonly number[] {
    return this.#groups
      .filter((group) => group.length < this.thresholdOf(group))
      .flat()
      .sort((a, b) => a - b);
  }

  /** Whether the complete groups are as many as the set's group threshold. */
  get enough(): boolean {
    return this.complete.length >= defined(this.#infos[0]).groupThreshold;
  }
}

/**
 * The members that check a surplus `member` of a group: the members that restored the secret
 * (`base`, as many as the threshold) with `member` in place of the last. They must give the same
 * secret, or `member` is not on the group's polynomial. The restore of complete shares and the
 * repair of marked ones check every surplus member so.
 */
export function surplusWindow<T>(base: readonly T[], member: T): T[] {
  return [...base.slice(0, -1), member];
}

/** A share given at a place, as the copy rule takes it: its UR and that place. */
export interface PlacedShare {
  readonly place: number;
  readonly ur: string;
}

/**
 * The shares of `shares` that copy an earlier one exactly, the same UR however each was written,
 * each with the place of the first: a copy adds nothing to a restore and is used, or saved, once.
 * The one rule for copies, which the shares as typed (share-input.ts), the backup check and an
 * export (ShareExport) apply.
 */
export function copiesAmong(
  shares: readonly PlacedShare[],
): { readonly place: number; readonly of: number }[] {
  const copies: { readonly place: number; readonly of: number }[] = [];
  for (const [index, share] of shares.entries()) {
    const first = shares.slice(0, index).find((other) => other.ur === share.ur);
    if (first !== undefined) copies.push({ place: share.place, of: first.place });
  }
  return copies;
}

/** `shares` without the copies of earlier ones (copiesAmong): each share once, the first typed. */
export function withoutCopies<Share extends PlacedShare>(shares: readonly Share[]): Share[] {
  const copied = new Set(copiesAmong(shares).map((copy) => copy.place));
  return shares.filter((share) => !copied.has(share.place));
}
