// Repairs the shares of one SSKR set together, each with elements marked with ? where they are
// unreadable. Every share alone gives an affine space of solutions over the bits of its marks
// (repair.ts, ReadingSpace). Across shares more is known, and all of it is linear over GF(2): the
// shares carry the same identifier and thresholds, each its member number, and every share beyond
// the first `threshold` lies on their polynomial (gf256.ts; multiplying by a known constant is
// GF(2)-linear). Solving all of it together settles what no share settles alone. What is still
// open is decided by the 32-bit digest that bc-shamir keeps beside the secret: each candidate is
// checked with HMAC-SHA256 here, and each one that passes is restored by the SSKR library itself.
// Every phrase that passes is reported; none is chosen.
//
// Only sets of one group are repaired, which is all that MnemoCode writes. JointRepair, at the
// end, is the entry: built with the host's SharePlatform (share-platform.ts), whose HMAC-SHA256
// checks each candidate and whose SSKR library restores it, it assesses the shares and searches
// them. Long work gives the host a turn now and then (SearchTurns, as every search of the library
// does), so that it can show progress or stop it. Joint and Branch, private here, are one reading
// of every share and a solved way to read them; each owns what it computes and the arrays of the
// secret that it holds. The functions before JointRepair stay for the hosts that already call
// them, and take the host's SharePlatform as JointRepair does: no platform is read from elsewhere.
//
// Needs from the host: its SharePlatform, the places at which the shares were typed, by which its
// refusals name them, and an AbortSignal, a turn and a progress callback for a search.
// Does not: ask whether to search, say what a repair filled in (repair-report.ts), or tell which
// shares a person typed (share-input.ts).

import { withJoinedMarksHint } from "../core/code-text.js";
import { wipeAll, BITS_PER_BYTE, xorInto } from "../core/bits.js";
import { BIP39_ENTROPY_BYTES } from "../core/bip39-sizes.js";
import {
  SearchTurns,
  startTimer,
  type SearchProgress,
  type SearchRun,
} from "../core/search-turns.js";
import {
  BitFields,
  bytesToBits,
  combination,
  linearize,
  PivotBasis,
  solve,
  unitVectors,
} from "./gf2.js";
import { DIGEST_X, gfMultiply, lagrangeCoefficients, SECRET_X } from "./gf256.js";
import {
  AMBIGUOUS_MARK_WIDTHS,
  AmbiguousMarksError,
  everyPick,
  markCount,
  MarkedReading,
  markProblem,
  placesWithin,
  type ReadingSpace,
  type ReadRepairableShare,
  exceedsMarks,
  markLimit,
} from "./repair.js";
import type { SharePlatform } from "./share-platform.js";
import { type ShareFormat, assertShareCount } from "./transport.js";
import { withoutCopies } from "./set-topology.js";
import {
  GROUP_BYTE,
  LOW_NIBBLE,
  MEMBER_BYTE,
  MEMBER_THRESHOLD_BYTE,
  NIBBLE_BITS,
  SHARE_METADATA_BYTES,
  MIN_DIGEST_THRESHOLD,
  storedCount,
} from "./share-layout.js";
import { restoreCompleteShares, uncheckedField } from "./complete-shares.js";
import { afterPlace } from "../core/prose.js";
import { placeOf } from "../core/places.js";

/** Marked elements on one share. The other shares settle most of them; see the assessment. */
export const MAX_JOINT_MARKED_ELEMENTS = 64;
/**
 * Combinations that a search may try, 2^40 in all: they take weeks, and leave about 2^8 phrases
 * that pass by chance.
 */
export const MAX_SEARCH_BITS = 40;
/** The combinations that a repair may search, MAX_SEARCH_BITS as a count. */
export const MAX_REPAIR_COMBINATIONS = 2 ** MAX_SEARCH_BITS;
/** The digest bits that bc-shamir compares (bc-shamir 0.13.0, shamir.rs, recover_secret). */
export const DIGEST_BITS = 32;
const DIGEST_BYTES = DIGEST_BITS / BITS_PER_BYTE;
/** Unsettled bits of the thresholds and member numbers, which MAX_BRANCHES follows from. */
const MAX_LABEL_BITS = 12;
/** Ways to read the shares (forms and member numbers) that are solved before refusing. */
const MAX_BRANCHES = 2 ** MAX_LABEL_BITS;
/** Values of undetermined elements tried until the shares read; they do not change the phrase. */
const MAX_HIDDEN_TRIES_BITS = 8;
/**
 * Digest checks between two reports of progress, each followed by a look at the search's turns
 * (SearchTurns.due). A deliberate fast path: each check is a synchronous HMAC-SHA256 of a
 * microsecond or so, and asking for a turn after every one of up to 2^40 of them would add a
 * microtask to each.
 */
const TRIES_PER_PROGRESS = 16_384;

/** A marked element: its share and place, both counted from 1. */
export interface MarkedElement {
  readonly share: number;
  readonly position: number;
}

/** What one share is on its own. */
export interface ShareAssessment {
  readonly marks: number;
  readonly forms: readonly ShareFormat[];
  /** Bits still open when the share is solved alone, the fewest over its readings. */
  readonly openAlone: number;
}

/** What reading one more element would leave open. */
export interface ElementHelp extends MarkedElement {
  readonly openBits: number;
}

/** What the shares are together, before any search. */
export interface JointAssessment {
  readonly shares: readonly ShareAssessment[];
  readonly secretBytes?: number;
  readonly threshold?: number;
  /** Ways to read the shares that fit every equation. */
  readonly branches: number;
  /** Bits that only the digest can decide, the most over the branches. */
  readonly openBits: number;
  /** Digest checks of the search. */
  readonly combinations: number;
  /** Phrases expected to pass the digest by chance: every wrong try passes with 2^-32. */
  readonly expectedFalse: number;
  /** More shares without marks that would settle every open bit. */
  readonly moreShares: number;
  /** Elements whose reading would leave fewer bits open, best first. */
  readonly helps: readonly ElementHelp[];
  /** The share, counted from 1, that no reading fits: the one that a "no-fit" refusal names. */
  readonly unfit?: number;
  /**
   * "determined": no bit is open, and the search checks one candidate per way to read the shares;
   * "search": the digest decides among `combinations`; the others refuse, with `reason`.
   */
  readonly verdict: "determined" | "search" | "too-uncertain" | "no-fit" | "not-enough";
  readonly reason?: string;
}

/** The shares of a set as written again, and what a repair left unsettled in them. */
export interface RepairedShares {
  readonly shares: readonly ReadRepairableShare[];
  /** Elements that the phrase does not depend on and nothing settles: their values are a guess. */
  readonly unsettled: readonly MarkedElement[];
}

/** A phrase that the shares restore, with every share as repaired. */
export interface RepairedSet extends RepairedShares {
  readonly mnemonic: string;
  /**
   * Shares, counted from 1, that took no part and were not checked: members of a group with fewer
   * than its threshold, in a set of several groups.
   */
  readonly unchecked?: readonly number[];
}

/** How far a search of marked shares has come: digest checks made, of all, and phrases found. */
export interface RepairProgress extends SearchProgress {
  readonly total: number;
}

/** How a host runs a search: its signal and turn (SearchRun), and its progress. */
export interface SearchOptions extends SearchRun {
  /** Called now and then with the checks made, of all, and the phrases found so far. */
  readonly onProgress?: ((progress: RepairProgress) => void) | undefined;
}

export interface JointPlan {
  readonly assessment: JointAssessment;
  /** Tries every open combination; resolves with every phrase that passes, possibly none. */
  readonly search: (options?: SearchOptions) => Promise<RepairedSet[]>;
  /** Wipes what the search keeps of the shares' secret; the plan searches no more after it. */
  readonly wipe: () => void;
}

/** The phrases of `plan`'s one search; what the plan kept of the secret is wiped after it. */
export async function searchOnce(plan: JointPlan, options?: SearchOptions): Promise<RepairedSet[]> {
  try {
    return await plan.search(options);
  } finally {
    plan.wipe();
  }
}

/**
 * One reading of every share, and their joint coordinates: bit offsets[s] + j is basis vector j of
 * share s. A class, so that the coordinates are laid out once and every question in them, a
 * share's marked bits or its payload at a joint point, is answered from that layout.
 */
class Joint {
  readonly #spaces: readonly ReadingSpace[];
  readonly #offsets: readonly number[];
  readonly #secretBytes: number;

  constructor(spaces: readonly ReadingSpace[], secretBytes: number) {
    this.#spaces = spaces;
    this.#offsets = spaces.map((_, share) =>
      spaces.slice(0, share).reduce((sum, space) => sum + space.basis.length, 0),
    );
    this.#secretBytes = secretBytes;
  }

  /** The reading of each share. */
  get spaces(): readonly ReadingSpace[] {
    return this.#spaces;
  }

  /** The bytes of the secret that every reading is of. */
  get secretBytes(): number {
    return this.#secretBytes;
  }

  /** The joint coordinates: every basis vector of every share. */
  get dimensions(): number {
    return this.#offsets.at(-1)! + this.#spaces.at(-1)!.basis.length;
  }

  /** The change that joint direction `z` makes to the marked bits of share `share`. */
  holeChange(share: number, z: bigint): bigint {
    return combination(this.#spaces[share]!.basis, this.#own(share, z));
  }

  /**
   * `use` applied to every share's payload at joint point `z`, which are wiped once it has its
   * answer: each holds a share's part of the secret, and only the answer is kept.
   */
  withPayloadsAt<T>(z: bigint, use: (payloads: readonly Uint8Array[]) => T): T {
    const payloads = this.#spaces.map((space, share) => space.payloadAt(this.#own(share, z)));
    try {
      return use(payloads);
    } finally {
      for (const payload of payloads) payload.fill(0);
    }
  }

  /** The arrays of every reading that hold a share's part of the secret. */
  secretArrays(): Uint8Array[] {
    return this.#spaces.flatMap((space) => space.secretArrays());
  }

  /** The bits of joint point `z` that pick share `share`'s basis vectors. */
  #own(share: number, z: bigint): bigint {
    return z >> BigInt(this.#offsets[share]!);
  }
}

/** What a solved way to read the shares is made of (Branch). */
interface BranchParts {
  readonly joint: Joint;
  readonly threshold: number;
  readonly members: readonly number[];
  readonly particular: bigint;
  /** Directions that change the secret or the digest, each with the change it makes to them. */
  readonly visible: readonly bigint[];
  readonly visibleDeltas: readonly Uint8Array[];
  /** Directions that change neither. */
  readonly hidden: readonly bigint[];
  /** The secret and the digest share at `particular`, S then D. */
  readonly secretAndDigest: Uint8Array;
}

/**
 * A solved way to read the shares: a threshold, a member number for each share, and the affine
 * space of the joint points that fit them, split into the directions that the digest decides and
 * those that it does not. A class because it holds a share's part of the secret, its (S, D) and
 * the changes to them, which it names for wiping (secretArrays), and because every question of
 * the plan and its search about one way to read the shares is answered by it.
 */
class Branch {
  readonly #parts: BranchParts;

  constructor(parts: BranchParts) {
    this.#parts = parts;
  }

  /** The member threshold of this way to read the shares. */
  get threshold(): number {
    return this.#parts.threshold;
  }

  /** The bytes of the secret. */
  get secretBytes(): number {
    return this.#parts.joint.secretBytes;
  }

  /** Bits that only the digest can decide. */
  get openBits(): number {
    return this.#parts.visible.length;
  }

  /** The combinations that a search of this branch tries. */
  get combinations(): number {
    return 2 ** this.openBits;
  }

  /** The readings of the shares that the branch was solved from. */
  get spaces(): readonly ReadingSpace[] {
    return this.#parts.joint.spaces;
  }

  /** The branch's own arrays that hold a share's part of the secret: its (S, D) and changes. */
  secretArrays(): Uint8Array[] {
    return [this.#parts.secretAndDigest, ...this.#parts.visibleDeltas];
  }

  /** Those of the branch with those of the readings it was solved from. */
  allSecretArrays(): Uint8Array[] {
    return [...this.secretArrays(), ...this.#parts.joint.secretArrays()];
  }

  /** Open bits of this branch if marked element `hole` of share `share` were read. */
  openBitsIfRead(share: number, hole: number): number {
    const { joint, visible, visibleDeltas, hidden } = this.#parts;
    const mask = joint.spaces[share]!.unitMask(hole);
    // Each direction with the change it makes in (S, D): a pair, typed as one so that a host that
    // compiles with noUncheckedIndexedAccess reads both of its parts as present.
    const directions: (readonly [bigint, bigint])[] = [
      ...visible.map((direction, i): readonly [bigint, bigint] => [
        direction,
        bytesToBits(visibleDeltas[i]!),
      ]),
      ...hidden.map((direction): readonly [bigint, bigint] => [direction, 0n]),
    ];
    // The combinations of directions that leave this element as it is, with their images in
    // (S, D). Each pivot is a change to the element, with the image in (S, D) of the directions
    // behind it.
    const parts = new PivotBasis();
    const kept: bigint[] = [];
    for (const [direction, image] of directions) {
      const reduced = parts.add(joint.holeChange(share, direction) & mask, image);
      if (reduced.vector === 0n) kept.push(reduced.companion);
    }
    return basisOf(kept).length;
  }

  /**
   * About how many more shares would settle what this branch leaves open. Each share beyond the
   * threshold adds as many equations as the secret has bits, and `threshold` shares without marks
   * settle everything; the marks of the new shares, or equations that depend on others, can make
   * one more needed.
   */
  sharesToSettle(shares: readonly ShareAssessment[]): number {
    const { threshold, members } = this.#parts;
    if (this.openBits === 0) return 0;
    const clean = new Set(members.filter((_, share) => shares[share]!.marks === 0)).size;
    const byEquations = Math.ceil(this.openBits / (BITS_PER_BYTE * this.secretBytes));
    return Math.max(1, Math.min(threshold - clean, byEquations));
  }

  /**
   * Tries every open combination of this branch against the digest, in Gray code order so that
   * each step adds one known change to (S, D); each candidate that passes is read and restored by
   * the SSKR library, and given to `found`. `tried` is told of every try; it may return a promise,
   * such as a turn of the host, which is awaited before the next try.
   */
  async searchDigest(
    platform: SharePlatform,
    found: (set: RepairedSet) => void,
    tried: () => Promise<void> | undefined,
  ): Promise<void> {
    const { particular, visible, visibleDeltas } = this.#parts;
    const current = Uint8Array.from(this.#parts.secretAndDigest);
    try {
      for (let step = 0; step < this.combinations; step += 1) {
        if (step > 0) {
          xorInto(current, visibleDeltas[lowestBit(step)]!);
        }
        if (digestFits(current, this.secretBytes, platform.hmacSha256)) {
          const gray = BigInt(step) ^ (BigInt(step) >> 1n);
          const repaired = await this.#confirm(particular ^ combination(visible, gray), platform);
          if (repaired !== undefined) found(repaired);
        }
        const turn = tried();
        if (turn !== undefined) await turn;
      }
    } finally {
      current.fill(0);
    }
  }

  /** Elements that a hidden direction changes. */
  unsettledElements(): MarkedElement[] {
    const { joint, hidden } = this.#parts;
    return joint.spaces.flatMap((space, share) => {
      const changed = hidden.reduce(
        (bits, direction) => bits | joint.holeChange(share, direction),
        0n,
      );
      return space
        .holesChangedBy(changed)
        .map((place) => ({ share: share + 1, position: place + 1 }));
    });
  }

  /** Every share at joint point `z`, read as an ordinary share; undefined if one does not read. */
  #readCandidate(z: bigint): ReadRepairableShare[] | undefined {
    const { joint } = this.#parts;
    const shares: ReadRepairableShare[] = [];
    for (const [share, space] of joint.spaces.entries()) {
      const values = space.valuesAt(space.particular ^ joint.holeChange(share, z));
      const read = space.reading.solvedShare(values);
      if (read === undefined) return undefined;
      shares.push(read);
    }
    return shares;
  }

  /**
   * Reads the shares of a candidate that passed the digest and restores the phrase. Undetermined
   * elements do not change the phrase; the first of their values with which every share reads are
   * taken, and they are reported as unsettled.
   */
  async #confirm(z: bigint, platform: SharePlatform): Promise<RepairedSet | undefined> {
    const { hidden } = this.#parts;
    const hiddenBits = Math.min(hidden.length, MAX_HIDDEN_TRIES_BITS);
    for (let choice = 0; choice < 2 ** hiddenBits; choice += 1) {
      const shares = this.#readCandidate(z ^ combination(hidden, BigInt(choice)));
      if (shares === undefined) continue;
      const restored = await restore(shares, platform);
      if (restored === undefined) return undefined;
      const { mnemonic, unchecked } = restored;
      return {
        mnemonic,
        shares,
        unsettled: this.unsettledElements(),
        ...uncheckedField(unchecked),
      };
    }
    return undefined;
  }
}

/**
 * The arrays that hold a share's part of the secret, made while the shares are assessed: the
 * payloads of their readings with the changes to them, and the secret and digest of each branch
 * with the changes to those. A class because one owner gathers them wherever they are made, so
 * that once the plan is made every array that its search does not keep is wiped: the readings and
 * branches that a better reading replaced, those of a refusal or of an assessment too open to
 * search, and all of them when the assessment is stopped (AUD-012-SEC004). Each reading and branch
 * names its own arrays (secretArrays), so that what is gathered and what is kept are one list.
 */
class AssessmentSecrets {
  readonly #made = new Set<Uint8Array>();

  /** Readings of the shares, solved for the assessment. */
  addSpaces(spaces: readonly ReadingSpace[]): void {
    for (const array of spaces.flatMap((space) => space.secretArrays())) this.#made.add(array);
  }

  /** A way to read the shares, solved for the assessment. */
  addBranch(branch: Branch): void {
    for (const array of branch.secretArrays()) this.#made.add(array);
  }

  /** Wipes every array made but those that `kept`, the branches of the plan's search, hold. */
  wipeAllBut(kept: readonly Branch[]): void {
    const keep = new Set(kept.flatMap((branch) => branch.allSecretArrays()));
    for (const array of this.#made) if (!keep.has(array)) array.fill(0);
    this.#made.clear();
  }
}

/** Rows that hold for every reading of a set of one group: one group, and the same metadata. */
function sharedResidual(payloads: readonly Uint8Array[]): bigint {
  const fields = new BitFields();
  const first = payloads[0]!;
  // One group of one: group threshold and count 1, group index 0.
  fields.add(first[GROUP_BYTE]!, BITS_PER_BYTE);
  fields.add(first[MEMBER_THRESHOLD_BYTE]! >>> NIBBLE_BITS, NIBBLE_BITS);
  for (const payload of payloads.slice(1))
    for (let byte = 0; byte < MEMBER_BYTE; byte += 1)
      fields.add(payload[byte]! ^ first[byte]!, BITS_PER_BYTE);
  return fields.vector;
}

/** The member threshold, less one, then the member number of every share, 4 bits each. */
function labelsOf(payloads: readonly Uint8Array[]): bigint {
  const fields = new BitFields();
  fields.add(payloads[0]![MEMBER_THRESHOLD_BYTE]! & LOW_NIBBLE, NIBBLE_BITS);
  for (const payload of payloads) fields.add(payload[MEMBER_BYTE]! & LOW_NIBBLE, NIBBLE_BITS);
  return fields.vector;
}

/** Every share beyond the base is a copy of a base share or lies on the base's polynomial. */
function polynomialResidual(
  payloads: readonly Uint8Array[],
  members: readonly number[],
  base: readonly number[],
  secretBytes: number,
): bigint {
  const fields = new BitFields();
  const xs = base.map((share) => members[share]!);
  payloads.forEach((payload, share) => {
    if (base.includes(share)) return;
    const copyOf = base.find((other) => members[other] === members[share]);
    const lambdas = copyOf === undefined ? lagrangeCoefficients(xs, members[share]!) : [];
    for (let k = SHARE_METADATA_BYTES; k < SHARE_METADATA_BYTES + secretBytes; k += 1) {
      let value = payload[k]!;
      if (copyOf !== undefined) value ^= payloads[copyOf]![k]!;
      else
        base.forEach((other, i) => {
          value ^= gfMultiply(lambdas[i]!, payloads[other]![k]!);
        });
      fields.add(value, BITS_PER_BYTE);
    }
  });
  return fields.vector;
}

/** The secret S and the digest share D of the base's polynomial, S then D. */
function secretAndDigest(
  payloads: readonly Uint8Array[],
  members: readonly number[],
  base: readonly number[],
  secretBytes: number,
): Uint8Array {
  const xs = base.map((share) => members[share]!);
  const toSecret = lagrangeCoefficients(xs, SECRET_X);
  const toDigest = lagrangeCoefficients(xs, DIGEST_X);
  const out = new Uint8Array(2 * secretBytes);
  for (let k = 0; k < secretBytes; k += 1)
    base.forEach((share, i) => {
      const y = payloads[share]![SHARE_METADATA_BYTES + k]!;
      out[k]! ^= gfMultiply(toSecret[i]!, y);
      out[secretBytes + k]! ^= gfMultiply(toDigest[i]!, y);
    });
  return out;
}

type Hmac = SharePlatform["hmacSha256"];

/** bc-shamir's check: HMAC-SHA256(key: D[4..], message: S) begins with D[0..4]. */
function digestFits(secretAndDigestBytes: Uint8Array, secretBytes: number, hmac: Hmac): boolean {
  const secret = secretAndDigestBytes.subarray(0, secretBytes);
  const digest = secretAndDigestBytes.subarray(secretBytes);
  const mac = hmac(digest.subarray(DIGEST_BYTES), secret);
  // The MAC is the caller's (SharePlatform.hmacSha256): it is made from the secret, so it is wiped
  // once compared; the key and the message stay with their owner.
  try {
    for (let index = 0; index < DIGEST_BYTES; index += 1)
      if (mac[index] !== digest[index]) return false;
    return true;
  } finally {
    mac.fill(0);
  }
}

/**
 * Digest checks per second in this host, from a short run on zero bytes, with `platform`'s
 * HMAC-SHA256 (JointRepair.triesPerSecond).
 */
export function measureTriesPerSecond(platform: Pick<SharePlatform, "hmacSha256">): number {
  const { hmacSha256 } = platform;
  // The longest secret, so that the rate holds for every phrase.
  const secretBytes = Math.max(...BIP39_ENTROPY_BYTES);
  const sample = new Uint8Array(2 * secretBytes);
  const tries = 10_000;
  const elapsed = startTimer();
  for (let index = 0; index < tries; index += 1) digestFits(sample, secretBytes, hmacSha256);
  const seconds = elapsed();
  return tries / Math.max(seconds, 1e-6);
}

/** Splits directions by whether they change (S, D); a hidden one is reduced so it changes none. */
function splitByDigest(
  directions: readonly bigint[],
  sdAt: (z: bigint) => Uint8Array,
  origin: bigint,
): { visible: bigint[]; visibleDeltas: Uint8Array[]; hidden: bigint[] } {
  const sd0 = sdAt(origin);
  // Each (S, D) made here becomes its change from sd0 in place, which its caller wipes; sd0 is
  // wiped at the end.
  const deltaOf = (direction: bigint) => {
    const delta = sdAt(origin ^ direction);
    xorInto(delta, sd0);
    return delta;
  };
  /** The change of `direction` as bits; the bytes of the change are wiped once read. */
  const bitsOfDelta = (direction: bigint) => {
    const delta = deltaOf(direction);
    try {
      return bytesToBits(delta);
    } finally {
      delta.fill(0);
    }
  };
  // Each pivot is a change to (S, D), with the direction that makes it.
  const images = new PivotBasis();
  const visible: bigint[] = [];
  const visibleDeltas: Uint8Array[] = [];
  const hidden: bigint[] = [];
  try {
    for (const original of directions) {
      const { vector: image, companion: direction } = images.add(bitsOfDelta(original), original);
      if (image === 0n) hidden.push(direction);
      else {
        visible.push(direction);
        visibleDeltas.push(deltaOf(direction));
      }
    }
  } catch (error) {
    for (const delta of visibleDeltas) delta.fill(0);
    throw error;
  } finally {
    sd0.fill(0);
  }
  return { visible, visibleDeltas, hidden };
}

/** A basis of the span of `vectors`. */
function basisOf(vectors: readonly bigint[]): bigint[] {
  const basis = new PivotBasis();
  for (const vector of vectors) basis.add(vector);
  return basis.vectors;
}

/** The first `threshold` shares with distinct members, or undefined when there are fewer. */
function baseOf(members: readonly number[], threshold: number): number[] | undefined {
  const base: number[] = [];
  for (let share = 0; share < members.length && base.length < threshold; share += 1)
    if (!base.some((other) => members[other] === members[share])) base.push(share);
  return base.length === threshold ? base : undefined;
}

/** What solving readings of the shares tells of the ways to read them, one or many solved. */
interface SolvedWays {
  readonly branches: Branch[];
  /** The rows that every reading shares have no solution: another set, or a misread element. */
  readonly conflict: boolean;
  /** Some possibility had as many distinct members as its threshold. */
  readonly enoughMembers: boolean;
  /** Some possibility gave two shares the same member number. */
  readonly duplicates: boolean;
}

/** What `more` adds to `ways`: its branches, and each fact that it tells too. */
function withWays<Ways extends SolvedWays>(ways: Ways, more: SolvedWays): Ways {
  return {
    ...ways,
    branches: [...ways.branches, ...more.branches],
    conflict: ways.conflict || more.conflict,
    enoughMembers: ways.enoughMembers || more.enoughMembers,
    duplicates: ways.duplicates || more.duplicates,
  };
}

/** What solving one reading of every share gives (solveJoint). */
interface JointSolution extends SolvedWays {
  /** The thresholds and member numbers leave too many possibilities to solve each. */
  readonly tooMany: boolean;
}

/**
 * The work that solveJoint may still do for the choices of thresholds and member numbers, each
 * choice an elimination of its own: payloads of one share evaluated, about a microsecond each. A
 * bound on the work of trying words (refined) that does not depend on the computer.
 */
interface WorkBudget {
  left: number;
}

/**
 * Solves one reading of every share: first the rows that every reading shares, then, for each
 * threshold and each set of member numbers that those leave possible, the polynomial.
 */
async function solveJoint(
  joint: Joint,
  turns: SearchTurns,
  secrets: AssessmentSecrets,
  budget?: WorkBudget,
): Promise<JointSolution> {
  const solution: JointSolution = {
    branches: [],
    conflict: false,
    tooMany: false,
    enoughMembers: false,
    duplicates: false,
  };
  const shared = linearize(
    (z) => joint.withPayloadsAt(z, sharedResidual),
    0n,
    unitVectors(joint.dimensions),
  );
  const common = solve(shared.columns, shared.value);
  if (common === undefined) return { ...solution, conflict: true };
  const labels = linearize(
    (z) => joint.withPayloadsAt(z, labelsOf),
    common.particular,
    common.free,
  );
  const labelBasis = basisOf(labels.columns);
  if (labelBasis.length > MAX_LABEL_BITS) return { ...solution, tooMany: true };
  if (budget !== undefined) {
    // Each choice evaluates the payloads of every share once for each free bit and once more.
    const work = 2 ** labelBasis.length * (common.free.length + 1) * joint.spaces.length;
    if (work > budget.left) return { ...solution, tooMany: true };
    budget.left -= work;
  }
  const shares = joint.spaces.length;
  const labelWidth = BigInt(NIBBLE_BITS * (shares + 1));
  let { enoughMembers, duplicates } = solution;
  for (let choice = 0; choice < 2 ** labelBasis.length; choice += 1) {
    // A turn now and then, not for each choice: a turn costs about a millisecond.
    await turns.due();
    const label = labels.value ^ combination(labelBasis, BigInt(choice));
    const threshold = storedCount(Number(label & BigInt(LOW_NIBBLE)));
    const members = Array.from({ length: shares }, (_, share) =>
      Number((label >> BigInt(NIBBLE_BITS * (share + 1))) & BigInt(LOW_NIBBLE)),
    );
    duplicates ||= new Set(members).size < shares;
    // A threshold of 1 keeps no digest, so nothing would be checked.
    const base = threshold < MIN_DIGEST_THRESHOLD ? undefined : baseOf(members, threshold);
    if (base === undefined) continue;
    enoughMembers = true;
    const residual = (z: bigint) =>
      joint.withPayloadsAt(z, (payloads) => {
        const polynomial = polynomialResidual(payloads, members, base, joint.secretBytes);
        return (labelsOf(payloads) ^ label) | (polynomial << labelWidth);
      });
    const local = linearize(residual, common.particular, common.free);
    const solved = solve(local.columns, local.value);
    if (solved === undefined) continue;
    const particular = common.particular ^ combination(common.free, solved.particular);
    const free = solved.free.map((direction) => combination(common.free, direction));
    const sdAt = (z: bigint) =>
      joint.withPayloadsAt(z, (payloads) =>
        secretAndDigest(payloads, members, base, joint.secretBytes),
      );
    const branch = new Branch({
      joint,
      threshold,
      members,
      particular,
      ...splitByDigest(free, sdAt, particular),
      secretAndDigest: sdAt(particular),
    });
    secrets.addBranch(branch);
    solution.branches.push(branch);
  }
  return { ...solution, enoughMembers, duplicates };
}

/**
 * Whether a share plainly belongs to a set of several groups: its group byte is set in every
 * reading.
 */
function severalGroups(spaces: readonly ReadingSpace[]): boolean {
  return spaces.every((space) => {
    const groups = space.fixedPayloadByte(GROUP_BYTE);
    return groups !== undefined && groups !== 0;
  });
}

/**
 * Elements whose reading would leave fewer open bits, best first. They are found in the branch
 * with the most open bits, which decides the time of the search: in every branch would cost as
 * many eliminations again for each of up to MAX_BRANCHES branches.
 */
async function helpfulElements(
  branches: readonly Branch[],
  turns: SearchTurns,
): Promise<ElementHelp[]> {
  const widest = branches.reduce((most, branch) =>
    branch.openBits > most.openBits ? branch : most,
  );
  const { openBits } = widest;
  if (openBits === 0) return [];
  const helps: ElementHelp[] = [];
  for (const [share, space] of widest.spaces.entries()) {
    // A turn for each share: they are few, and each takes a while for many marks.
    await turns.take();
    for (const [hole, place] of space.holes.entries())
      helps.push({
        share: share + 1,
        position: place + 1,
        openBits: widest.openBitsIfRead(share, hole),
      });
  }
  return helps.filter((help) => help.openBits < openBits).sort((a, b) => a.openBits - b.openBits);
}

/**
 * Why the share at `place`, counted from 1, holds more marks than a joint repair takes, or
 * undefined: the early check of a share as it is typed and the bound of planJointRepair.
 */
export function jointMarkLimitProblem(place: number, text: string): string | undefined {
  return exceedsMarks(text, MAX_JOINT_MARKED_ELEMENTS)
    ? afterPlace("Share", place, `${markLimit(MAX_JOINT_MARKED_ELEMENTS)}.`)
    : undefined;
}

/**
 * Every reading of the share at `place`, counted from 1 (MarkedReading.of); a share whose marks
 * fit too many ways is refused by that place.
 */
function readingsOf(place: number, text: string): MarkedReading[] {
  try {
    return MarkedReading.of(text);
  } catch (error) {
    if (error instanceof AmbiguousMarksError)
      throw new Error(afterPlace("Share", place, AMBIGUOUS_MARK_WIDTHS));
    throw error;
  }
}

function refusal(
  shares: readonly ShareAssessment[],
  verdict: JointAssessment["verdict"],
  reason: string,
  unfit?: number,
): JointPlan {
  return {
    assessment: {
      shares,
      branches: 0,
      openBits: 0,
      combinations: 0,
      expectedFalse: 0,
      moreShares: 0,
      helps: [],
      verdict,
      reason,
      ...(unfit === undefined ? {} : { unfit }),
    },
    search: async () => [],
    wipe: () => undefined,
  };
}

/** The value of a field when every branch agrees on it. */
function agreed<T>(branches: readonly Branch[], field: (branch: Branch) => T): T | undefined {
  const values = new Set(branches.map(field));
  return values.size === 1 ? [...values][0] : undefined;
}

/**
 * The refusal of a share that no reading fits, named "Share `name`": a code marked with the wrong
 * number of symbols is named (markProblem); otherwise its marks are named only when it has any,
 * since a share without them is typed wrong, or is no share. The plan names a share by the place
 * it was typed at (PlanOptions.places), or by its index where none is given.
 */
function unreadableShareMessage(name: number, marks: number, text: string): string {
  const problem = markProblem(text);
  if (problem !== undefined) return afterPlace("Share", name, problem);
  return marks === 0
    ? `Share ${name} cannot be read as a share: check each of its elements.`
    : withJoinedMarksHint(
        `Share ${name} cannot be read as a share: check the elements marked with ?, and the others.`,
        text,
      );
}

/**
 * What solving every combination of the shares' readings gives (solveReadings): the ways of every
 * combination, a conflict where the rows that every reading shares had no solution in some.
 */
interface Solved extends SolvedWays {
  /** Some length of the secret is one that every share can be read in. */
  readonly sameLength: boolean;
  /** Why the shares cannot be assessed at all, when they cannot. */
  readonly refused?: { readonly verdict: JointAssessment["verdict"]; readonly reason: string };
}

/**
 * Solves every combination of one reading of each share (solveJoint), for each length of the
 * secret that every share can be read in, and gathers the branches.
 */
async function solveReadings(
  spacesOf: readonly (readonly ReadingSpace[])[],
  turns: SearchTurns,
  secrets: AssessmentSecrets,
  budget?: WorkBudget,
): Promise<Solved> {
  let ways: SolvedWays = { branches: [], conflict: false, enoughMembers: false, duplicates: false };
  let sameLength = false;
  const solved = (refused?: Solved["refused"]): Solved => ({
    ...ways,
    sameLength,
    ...(refused === undefined ? {} : { refused }),
  });
  const lengths = new Set(spacesOf[0]!.map((space) => space.reading.structure.payloadLength));
  for (const payloadLength of lengths) {
    const secretBytes = payloadLength - SHARE_METADATA_BYTES;
    if (!BIP39_ENTROPY_BYTES.includes(secretBytes)) continue;
    const choices = spacesOf.map((spaces) =>
      spaces.filter((space) => space.reading.structure.payloadLength === payloadLength),
    );
    if (choices.some((options) => options.length === 0)) continue;
    sameLength = true;
    const readings = everyPick(choices, MAX_BRANCHES);
    if (readings === undefined)
      return solved({
        verdict: "too-uncertain",
        reason: "Too many forms fit these shares; mark fewer.",
      });
    // Readings with the fewest forms first: a share all marked is then taken in the form of the
    // others, which is how its repair is shown.
    const formsIn = (spaces: readonly ReadingSpace[]) =>
      new Set(spaces.map((space) => space.reading.format)).size;
    readings.sort((a, b) => formsIn(a) - formsIn(b));
    for (const spaces of readings) {
      const joint = await solveJoint(new Joint(spaces, secretBytes), turns, secrets, budget);
      if (joint.tooMany)
        return solved({
          verdict: "too-uncertain",
          reason:
            "The member numbers of these shares cannot be told; read more of their first elements.",
        });
      ways = withWays(ways, joint);
      if (ways.branches.length > MAX_BRANCHES)
        return solved({
          verdict: "too-uncertain",
          reason: "Too many ways fit these shares; mark fewer.",
        });
    }
  }
  return solved();
}

/** The combinations that a search of `branches` tries. */
function combinationsOf(branches: readonly Branch[]): number {
  return branches.reduce((sum, branch) => sum + branch.combinations, 0);
}

/**
 * Combinations of words that the partly read Unicode codes of all the shares are tried in, word
 * by word (refined), and the work that all of them may do together for the choices of thresholds
 * and member numbers (WorkBudget): a few seconds at most, so that the assessment never runs for
 * minutes. Beyond them
 * the codes stay unknown as a whole, and the assessment says what would help.
 */
const CODE_TRIALS = 64;
const TRIAL_WORK = 2 ** 19;

/**
 * The branches of the shares with their partly read Unicode codes tried word by word: the codes
 * with the fewest fitting words, across the shares, as many as keep the combinations within
 * CODE_TRIALS (repair.ts, placesWithin and choicesAt), each combination solved as the shares
 * are. Every word that fits a code is tried, so nothing that the digits allow is lost. Undefined
 * when no code is read in part, or when that does not shorten the search of `branches`: the codes
 * then stay unknown as a whole, their digits still checked (MarkedReading.fits).
 */
async function refined(
  spacesOf: readonly (readonly ReadingSpace[])[],
  before: number,
  turns: SearchTurns,
  secrets: AssessmentSecrets,
): Promise<Branch[] | undefined> {
  if (before <= 1) return undefined;
  const units = spacesOf.flatMap((spaces, share) => {
    const reading = spaces.find((space) => space.reading.candidates !== undefined)?.reading;
    return reading === undefined
      ? []
      : reading.candidateCounts().map((unit) => ({
          ...unit,
          share,
          metadata: reading.reachesMetadata(unit.place),
        }));
  });
  // The codes that reach the metadata first, which tell the member numbers; then those with the
  // fewest words, which gain the most bits for their choices.
  units.sort((a, b) => Number(b.metadata) - Number(a.metadata) || a.count - b.count);
  const chosen = placesWithin(units, CODE_TRIALS);
  if (chosen.length === 0) return undefined;
  const expanded: ReadingSpace[][] = [];
  for (const [share, spaces] of spacesOf.entries()) {
    await turns.take();
    const places = chosen.filter((unit) => unit.share === share).map((unit) => unit.place);
    const tried = spaces.flatMap((space) =>
      space.reading
        .choicesAt(places)
        .map((reading) => reading.space())
        .filter((reading): reading is ReadingSpace => reading !== undefined),
    );
    secrets.addSpaces(tried);
    expanded.push(tried);
  }
  if (expanded.some((spaces) => spaces.length === 0)) return undefined;
  const solved = await solveReadings(expanded, turns, secrets, { left: TRIAL_WORK });
  if (solved.refused !== undefined || solved.branches.length === 0) return undefined;
  return combinationsOf(solved.branches) < before ? solved.branches : undefined;
}

/** How planJointRepair assesses the shares. */
export interface PlanOptions extends SearchRun {
  /** The host's services, with which the search checks and restores each candidate. */
  readonly platform: SharePlatform;
  /**
   * The place at which each share was typed, by its index among `records`, by which a refusal
   * names it; by its index, counted from 1, where none is given.
   */
  readonly places?: readonly number[] | undefined;
}

/**
 * Assesses the shares as typed, with ? for each unreadable element, and returns a plan whose search
 * finds every phrase they can restore. Nothing is tried before `search` is called. The run's
 * signal stops the assessment, which can take a while for many marks, and its turn lets the host
 * run now and then (SearchTurns).
 */
export async function planJointRepair(
  records: readonly string[],
  options: PlanOptions,
): Promise<JointPlan> {
  // A host's platform is checked before its signal: without it no search could follow.
  checkedPlatform(options?.platform);
  // Refuses a signal that is already aborted before anything else.
  const turns = SearchTurns.of(options);
  // The bound of every set of shares, before any record is read (AUD-012-API002).
  assertShareCount(records.length);
  const { platform, places } = options;
  const texts = Array.from(records, (record) => record.trim());
  for (const [index, text] of texts.entries()) {
    const problem = jointMarkLimitProblem(placeOf(places, index + 1), text);
    if (problem !== undefined) throw new Error(problem);
  }
  // A plan that can search keeps the arrays of its branches for its searches; every other array
  // made for the assessment is wiped, all of them when it is stopped (AUD-012-SEC004).
  const secrets = new AssessmentSecrets();
  let assessed: Assessed | undefined;
  try {
    const spacesOf: ReadingSpace[][] = [];
    for (const [index, text] of texts.entries()) {
      // A turn between the shares, however quick: reading one is quick, but many add up, and a
      // stop typed meanwhile is heard (SearchTurns.take).
      await turns.take();
      const spaces = readingsOf(placeOf(places, index + 1), text)
        .map((reading) => reading.space())
        .filter((space): space is ReadingSpace => space !== undefined);
      secrets.addSpaces(spaces);
      spacesOf.push(spaces);
    }
    assessed = await assessReadings(spacesOf, texts, { platform, places, turns, secrets });
    return assessed.plan;
  } finally {
    const verdict = assessed?.plan.assessment.verdict;
    const searched = verdict === "search" || verdict === "determined";
    secrets.wipeAllBut(searched ? assessed!.kept : []);
  }
}

/** A plan, and the branches that its search keeps: none for a refusal. */
interface Assessed {
  readonly plan: JointPlan;
  readonly kept: readonly Branch[];
}

/** What an assessment runs with: the host's platform and places, its turns, and its secrets. */
interface AssessmentRun {
  readonly platform: SharePlatform;
  readonly places: readonly number[] | undefined;
  readonly turns: SearchTurns;
  readonly secrets: AssessmentSecrets;
}

/** The assessment of the readings of every share, and the plan of the search that it allows. */
async function assessReadings(
  spacesOf: readonly ReadingSpace[][],
  texts: readonly string[],
  run: AssessmentRun,
): Promise<Assessed> {
  const { platform, places, turns, secrets } = run;
  const shares: ShareAssessment[] = spacesOf.map((spaces, index) => ({
    marks: markCount(texts[index]!),
    forms: [...new Set(spaces.map((space) => space.reading.format))],
    openAlone: spaces.length === 0 ? 0 : Math.min(...spaces.map((space) => space.basis.length)),
  }));
  const refuse = (
    verdict: JointAssessment["verdict"],
    reason: string,
    unfit?: number,
  ): Assessed => ({
    plan: refusal(shares, verdict, reason, unfit),
    kept: [],
  });
  const plan = async (branches: readonly Branch[]): Promise<Assessed> => ({
    plan: await planOf(shares, branches, platform, turns),
    kept: branches,
  });
  const unfit = spacesOf.findIndex((spaces) => spaces.length === 0);
  if (unfit >= 0) {
    const message = unreadableShareMessage(
      placeOf(places, unfit + 1),
      shares[unfit]!.marks,
      texts[unfit]!,
    );
    return refuse("no-fit", message, unfit + 1);
  }
  if (spacesOf.some(severalGroups))
    return refuse(
      "no-fit",
      "These shares belong to a set of several groups; only sets of one group are repaired.",
    );
  const solved = await solveReadings(spacesOf, turns, secrets);
  if (solved.refused !== undefined) {
    // The digits read of partly read codes may tell what the codes unknown as a whole cannot.
    const tried =
      solved.refused.verdict === "too-uncertain"
        ? await refined(spacesOf, Number.POSITIVE_INFINITY, turns, secrets)
        : undefined;
    if (tried === undefined) return refuse(solved.refused.verdict, solved.refused.reason);
    return plan(tried);
  }
  if (!solved.sameLength)
    return refuse("no-fit", "These shares are of different lengths: not of one set.");
  if (solved.branches.length === 0) {
    // The common rows fail for shares of another set, or for a misread identifier or threshold:
    // more shares would not help.
    if (solved.enoughMembers || solved.conflict)
      return refuse(
        "no-fit",
        "These shares do not fit together: check the marks, and that all belong to one set.",
      );
    return refuse(
      "not-enough",
      solved.duplicates
        ? "The same share is given more than once: the threshold of this set needs more shares."
        : "Too few shares: the threshold of this set needs more of them.",
    );
  }
  // Partly read Unicode codes are tried word by word where that shortens the search; the verdicts
  // above come from the codes unknown as a whole, which a wrong word cannot mislead.
  const branches =
    (await refined(spacesOf, combinationsOf(solved.branches), turns, secrets)) ?? solved.branches;
  return plan(branches);
}

/** The assessment of `branches` and the search of them, with the host's platform. */
async function planOf(
  shares: readonly ShareAssessment[],
  branches: readonly Branch[],
  platform: SharePlatform,
  turns: SearchTurns,
): Promise<JointPlan> {
  const openBits = Math.max(...branches.map((branch) => branch.openBits));
  const combinations = combinationsOf(branches);
  const threshold = agreed(branches, (branch) => branch.threshold);
  const secretBytes = agreed(branches, (branch) => branch.secretBytes);
  const tooOpen = combinations > MAX_REPAIR_COMBINATIONS;
  const assessment: JointAssessment = {
    shares,
    ...(secretBytes === undefined ? {} : { secretBytes }),
    ...(threshold === undefined ? {} : { threshold }),
    branches: branches.length,
    openBits,
    combinations,
    expectedFalse: (combinations - 1) / 2 ** DIGEST_BITS,
    moreShares: Math.max(...branches.map((branch) => branch.sharesToSettle(shares))),
    helps: await helpfulElements(branches, turns),
    verdict: tooOpen ? "too-uncertain" : openBits === 0 ? "determined" : "search",
    ...(tooOpen
      ? {
          reason: `About 2^${Math.ceil(Math.log2(combinations))} combinations stay open; at most 2^${MAX_SEARCH_BITS} can be searched.`,
        }
      : {}),
  };
  if (tooOpen) return { assessment, search: async () => [], wipe: () => undefined };
  return {
    assessment,
    search: (options) => searchBranches(branches, platform, options),
    wipe: () => wipeAll(branches.flatMap((branch) => branch.allSecretArrays())),
  };
}

/** The place of the lowest set bit of a positive integer below 2^53. */
function lowestBit(value: number): number {
  const low = value % 2 ** 32;
  if (low === 0) return 32 + lowestBit(Math.floor(value / 2 ** 32));
  return 31 - Math.clz32(low & -low);
}

/**
 * Tries every open combination of every branch against the digest (Branch.searchDigest); a
 * candidate that passes is read and restored by the SSKR library. Resolves with every distinct
 * phrase. Progress is told every TRIES_PER_PROGRESS checks and after the last, and the host's
 * turns are asked for at each report.
 */
async function searchBranches(
  branches: readonly Branch[],
  platform: SharePlatform,
  options: SearchOptions = {},
): Promise<RepairedSet[]> {
  // Refuses a signal that is already aborted before any check.
  const turns = SearchTurns.of(options);
  const total = combinationsOf(branches);
  const found = new Map<string, RepairedSet>();
  const progress = (checked: number): RepairProgress => ({ checked, total, found: found.size });
  let done = 0;
  const tried = (): Promise<void> | undefined => {
    done += 1;
    if (done % TRIES_PER_PROGRESS !== 0) return undefined;
    options.onProgress?.(progress(done));
    return turns.due().then(() => undefined);
  };
  const add = (repaired: RepairedSet): void => {
    const known = found.get(repaired.mnemonic);
    found.set(repaired.mnemonic, known === undefined ? repaired : merged(known, repaired));
  };
  for (const branch of branches) await branch.searchDigest(platform, add, tried);
  options.onProgress?.(progress(total));
  return [...found.values()];
}

/**
 * One phrase from two candidates, such as a share all marked read with two member numbers: the
 * shares of the first are kept, and the elements in which the two differ are unsettled.
 */
function merged(first: RepairedSet, other: RepairedSet): RepairedSet {
  const differing = first.shares.flatMap((share, index) => {
    const second = other.shares[index]!;
    if (share.ur === second.ur) return [];
    const values = new Map(second.filled.map((element) => [element.position, element.value]));
    return share.filled
      .filter(
        (element) =>
          share.format !== second.format || values.get(element.position) !== element.value,
      )
      .map((element) => ({ share: index + 1, position: element.position }));
  });
  const unsettled = new Map(
    [...first.unsettled, ...other.unsettled, ...differing].map((element) => [
      `${element.share}:${element.position}`,
      element,
    ]),
  );
  return {
    ...first,
    unsettled: [...unsettled.values()].sort((a, b) => a.share - b.share || a.position - b.position),
  };
}

/**
 * Restores the phrase from the shares read, as complete shares are restored (complete-shares.ts):
 * each copy once, every surplus member checked against the others, two different shares of one
 * member refused. Undefined when the shares do not restore one phrase.
 */
async function restore(
  shares: readonly ReadRepairableShare[],
  platform: SharePlatform,
): Promise<{ readonly mnemonic: string; readonly unchecked: readonly number[] } | undefined> {
  // Each copy once, the first typed (withoutCopies): the places of the shares kept, in order.
  const kept = withoutCopies(shares.map((share, place) => ({ place, ur: share.ur }))).map(
    (share) => share.place,
  );
  try {
    const { mnemonic, unchecked } = await restoreCompleteShares(
      kept.map((place) => shares[place]!.ur),
      platform,
    );
    // The places among the shares read, counted from 0, of the shares kept that took no part.
    return { mnemonic, unchecked: unchecked.map((index) => kept[index]!) };
  } catch {
    // A refusal of the set: this reading of the shares is not one of it.
    return undefined;
  }
}

/**
 * `platform`, refused unless it has what a repair calls: the digest check and the restore of the
 * SSKR library. A host written in JavaScript may leave it out, which the types alone do not stop.
 */
function checkedPlatform(platform: SharePlatform | undefined): SharePlatform {
  if (typeof platform?.hmacSha256 !== "function" || typeof platform.combineShares !== "function")
    throw new TypeError("A share repair needs the host's SharePlatform.");
  return platform;
}

/**
 * The repair of marked shares with the host's services. A class, so that a page binds its
 * SharePlatform once and every assessment, search and measure of its pace uses it.
 */
export class JointRepair {
  readonly #platform: SharePlatform;

  constructor(platform: SharePlatform) {
    this.#platform = checkedPlatform(platform);
  }

  /** Marked elements on one share that a repair takes (MAX_JOINT_MARKED_ELEMENTS). */
  static readonly MAX_MARKED_ELEMENTS = MAX_JOINT_MARKED_ELEMENTS;

  /**
   * Assesses `records`, the shares as typed with ? for each unreadable element, and returns the
   * plan whose search finds every phrase they can restore (planJointRepair). `places` names each
   * share in a refusal by the place it was typed at.
   */
  plan(
    records: readonly string[],
    options: Omit<PlanOptions, "platform"> = {},
  ): Promise<JointPlan> {
    return planJointRepair(records, { ...options, platform: this.#platform });
  }

  /** Digest checks per second in this host, for the time of a search (RepairReport). */
  triesPerSecond(): number {
    return measureTriesPerSecond(this.#platform);
  }
}
