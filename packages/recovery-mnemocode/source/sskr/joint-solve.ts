// The solution of marked shares of one set together (joint-repair.ts): one reading of every share
// (Joint), its equations over GF(2) with those of the set and its polynomial, and each solved way
// to read the shares (Branch), whose open bits the 32-bit digest decides. Each owns what it
// computes and the arrays of the secret that it holds, and wipes them.

import { BITS_PER_BYTE, xorInto } from "../core/bits.js";
import { SearchTurns, type TurnState } from "../core/search-turns.js";
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
import { type ReadingSpace, type ReadRepairableShare } from "./repair.js";
import type { SharePlatform } from "./share-platform.js";
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
import { defined } from "../core/defined.js";
import {
  type ElementHelp,
  type MarkedElement,
  type RepairedSet,
  type ShareAssessment,
} from "./joint-results.js";

/** The digest bits that bc-shamir compares (bc-shamir 0.13.0, shamir.rs, recover_secret). */
export const DIGEST_BITS = 32;

const DIGEST_BYTES = DIGEST_BITS / BITS_PER_BYTE;

/** Unsettled bits of the thresholds and member numbers, which MAX_BRANCHES follows from. */
const MAX_LABEL_BITS = 12;

/** Ways to read the shares (forms and member numbers) that are solved before refusing. */
export const MAX_BRANCHES = 2 ** MAX_LABEL_BITS;

/** Values of undetermined elements tried until the shares read; they do not change the phrase. */
const MAX_HIDDEN_TRIES_BITS = 8;

/**
 * One reading of every share, and their joint coordinates: bit offsets[s] + j is basis vector j of
 * share s. A class, so that the coordinates are laid out once and every question in them, a
 * share's marked bits or its payload at a joint point, is answered from that layout.
 */
export class Joint {
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
    return defined(this.#offsets.at(-1)) + defined(this.#spaces.at(-1)).basis.length;
  }

  /** The change that joint direction `z` makes to the marked bits of share `share`. */
  holeChange(share: number, z: bigint): bigint {
    return combination(defined(this.#spaces[share]).basis, this.#own(share, z));
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
    return z >> BigInt(defined(this.#offsets[share]));
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
export class Branch {
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
    const mask = defined(joint.spaces[share]).unitMask(hole);
    // Each direction with the change it makes in (S, D): a pair, typed as one so that a host that
    // compiles with noUncheckedIndexedAccess reads both of its parts as present.
    const directions: (readonly [bigint, bigint])[] = [
      ...visible.map((direction, i): readonly [bigint, bigint] => [
        direction,
        bytesToBits(defined(visibleDeltas[i])),
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
    const clean = new Set(members.filter((_, share) => defined(shares[share]).marks === 0)).size;
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
    tried: () => Promise<TurnState> | undefined,
  ): Promise<void> {
    const { particular, visible, visibleDeltas } = this.#parts;
    const current = Uint8Array.from(this.#parts.secretAndDigest);
    try {
      for (let step = 0; step < this.combinations; step += 1) {
        if (step > 0) {
          xorInto(current, defined(visibleDeltas[lowestBit(step)]));
        }
        if (digestFits(current, this.secretBytes, platform.hmacSha256)) {
          const gray = BigInt(step) ^ (BigInt(step) >> 1n);
          const repaired = await this.#confirm(particular ^ combination(visible, gray), platform);
          if (repaired !== undefined) found(repaired);
        }
        const turn = tried();
        // A stop of the host ends this branch's search; the caller tells it (searchBranches).
        if (turn !== undefined && (await turn) === "stopped") return;
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
export class AssessmentSecrets {
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
  /** Wipes every array made, when no search keeps any (TS-07). */
  wipe(): void {
    this.wipeAllBut([]);
  }

  [Symbol.dispose](): void {
    this.wipe();
  }
}

/** Rows that hold for every reading of a set of one group: one group, and the same metadata. */
function sharedResidual(payloads: readonly Uint8Array[]): bigint {
  const fields = new BitFields();
  const first = defined(payloads[0]);
  // One group of one: group threshold and count 1, group index 0.
  fields.add(defined(first[GROUP_BYTE]), BITS_PER_BYTE);
  fields.add(defined(first[MEMBER_THRESHOLD_BYTE]) >>> NIBBLE_BITS, NIBBLE_BITS);
  for (const payload of payloads.slice(1))
    for (let byte = 0; byte < MEMBER_BYTE; byte += 1)
      fields.add(defined(payload[byte]) ^ defined(first[byte]), BITS_PER_BYTE);
  return fields.vector;
}

/** The member threshold, less one, then the member number of every share, 4 bits each. */
function labelsOf(payloads: readonly Uint8Array[]): bigint {
  const fields = new BitFields();
  fields.add(defined(defined(payloads[0])[MEMBER_THRESHOLD_BYTE]) & LOW_NIBBLE, NIBBLE_BITS);
  for (const payload of payloads)
    fields.add(defined(payload[MEMBER_BYTE]) & LOW_NIBBLE, NIBBLE_BITS);
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
  const xs = base.map((share) => defined(members[share]));
  payloads.forEach((payload, share) => {
    if (base.includes(share)) return;
    const copyOf = base.find((other) => members[other] === members[share]);
    const lambdas = copyOf === undefined ? lagrangeCoefficients(xs, defined(members[share])) : [];
    for (let k = SHARE_METADATA_BYTES; k < SHARE_METADATA_BYTES + secretBytes; k += 1) {
      let value = defined(payload[k]);
      if (copyOf !== undefined) value ^= defined(defined(payloads[copyOf])[k]);
      else
        base.forEach((other, i) => {
          value ^= gfMultiply(defined(lambdas[i]), defined(defined(payloads[other])[k]));
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
  const xs = base.map((share) => defined(members[share]));
  const toSecret = lagrangeCoefficients(xs, SECRET_X);
  const toDigest = lagrangeCoefficients(xs, DIGEST_X);
  const out = new Uint8Array(2 * secretBytes);
  for (let k = 0; k < secretBytes; k += 1)
    base.forEach((share, i) => {
      const y = defined(defined(payloads[share])[SHARE_METADATA_BYTES + k]);
      out[k] = defined(out[k]) ^ gfMultiply(defined(toSecret[i]), y);
      out[secretBytes + k] = defined(out[secretBytes + k]) ^ gfMultiply(defined(toDigest[i]), y);
    });
  return out;
}

type Hmac = SharePlatform["hmacSha256"];

/** bc-shamir's check: HMAC-SHA256(key: D[4..], message: S) begins with D[0..4]. */
export function digestFits(
  secretAndDigestBytes: Uint8Array,
  secretBytes: number,
  hmac: Hmac,
): boolean {
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
export interface SolvedWays {
  readonly branches: Branch[];
  /**
   * Some reading fits as far as its shares go: the rows that they all share have a solution, and
   * no possibility has as many distinct members as its threshold. More shares may then settle it;
   * where no reading fits, the shares are of another set or misread (AUD-022-FUN001: one reading
   * that does not fit, such as a decoy prefix, no longer outvotes the one that does).
   */
  readonly needsMore: boolean;
  /** Some possibility gave two shares the same member number. */
  readonly duplicates: boolean;
}

/** What `more` adds to `ways`: its branches, and each fact that it tells too. */
export function withWays<Ways extends SolvedWays>(ways: Ways, more: SolvedWays): Ways {
  return {
    ...ways,
    branches: [...ways.branches, ...more.branches],
    needsMore: ways.needsMore || more.needsMore,
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
export interface WorkBudget {
  left: number;
}

/**
 * Solves one reading of every share: first the rows that every reading shares, then, for each
 * threshold and each set of member numbers that those leave possible, the polynomial.
 */
export async function solveJoint(
  joint: Joint,
  turns: SearchTurns,
  secrets: AssessmentSecrets,
  budget?: WorkBudget,
): Promise<JointSolution> {
  const solution: JointSolution = {
    branches: [],
    needsMore: false,
    tooMany: false,
    duplicates: false,
  };
  const shared = linearize(
    (z) => joint.withPayloadsAt(z, sharedResidual),
    0n,
    unitVectors(joint.dimensions),
  );
  const common = solve(shared.columns, shared.value);
  // Another set, or a misread element: the reading does not fit.
  if (common === undefined) return solution;
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
  let enoughMembers = false;
  let { duplicates } = solution;
  for (let choice = 0; choice < 2 ** labelBasis.length; choice += 1) {
    // A turn now and then, not for each choice: a turn costs about a millisecond. A stop of the
    // host ends the solving; the caller sees it in `turns` and drops what was solved.
    if ((await turns.due()) === "stopped") break;
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
  return { ...solution, needsMore: !enoughMembers, duplicates };
}

/**
 * Whether a share plainly belongs to a set of several groups: its group byte is set in every
 * reading.
 */
export function severalGroups(spaces: readonly ReadingSpace[]): boolean {
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
export async function helpfulElements(
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
    // A turn for each share: they are few, and each takes a while for many marks. The caller sees
    // a stop in `turns`.
    if ((await turns.take()) === "stopped") return [];
    for (const [hole, place] of space.holes.entries())
      helps.push({
        share: share + 1,
        position: place + 1,
        openBits: widest.openBitsIfRead(share, hole),
      });
  }
  return helps.filter((help) => help.openBits < openBits).sort((a, b) => a.openBits - b.openBits);
}

/** The place of the lowest set bit of a positive integer below 2^53. */
function lowestBit(value: number): number {
  const low = value % 2 ** 32;
  if (low === 0) return 32 + lowestBit(Math.floor(value / 2 ** 32));
  return 31 - Math.clz32(low & -low);
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
      kept.map((place) => defined(shares[place]).ur),
      platform,
    );
    // The places among the shares read, counted from 0, of the shares kept that took no part.
    return { mnemonic, unchecked: unchecked.map((index) => defined(kept[index])) };
  } catch {
    // A refusal of the set: this reading of the shares is not one of it.
    return undefined;
  }
}
