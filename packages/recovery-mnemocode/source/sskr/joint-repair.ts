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
// does), so that it can show progress or stop it. Joint and Branch (joint-solve.ts) are one
// reading of every share and a solved way to read them; each owns what it computes and the arrays
// of the secret that it holds. What a repair tells is joint-results.ts. The functions before
// JointRepair stay for the hosts that already call them, and take the host's SharePlatform as
// JointRepair does: no platform is read from elsewhere.
//
// Needs from the host: its SharePlatform, the places at which the shares were typed, by which its
// refusals name them, and an AbortSignal, a turn and a progress callback for a search.
// Does not: ask whether to search, say what a repair filled in (repair-report.ts), or tell which
// shares a person typed (share-input.ts).

import { withJoinedMarksHint } from "../core/code-text.js";
import { wipeAll } from "../core/bits.js";
import { BIP39_ENTROPY_BYTES } from "../core/bip39-sizes.js";
import {
  SearchTurns,
  startTimer,
  type SearchProgress,
  type SearchRun,
  type TurnState,
} from "../core/search-turns.js";
import {
  everyPick,
  markCount,
  MarkedReading,
  markProblem,
  placesWithin,
  type ReadingSpace,
  exceedsMarks,
  markLimit,
} from "./repair.js";
import { AMBIGUOUS_MARK_WIDTHS, AmbiguousMarksError } from "./repair-models.js";
import { MAX_PARTIAL_UNIT_CANDIDATES } from "./repair-units.js";
import type { SharePlatform } from "./share-platform.js";
import { assertShareCount } from "./transport.js";
import { SHARE_METADATA_BYTES } from "./share-layout.js";
import { afterPlace } from "../core/prose.js";
import { placeOf } from "../core/places.js";
import { defined } from "../core/defined.js";
import {
  type JointAssessment,
  type RepairedSet,
  type RepairSearch,
  type ShareAssessment,
} from "./joint-results.js";
import {
  AssessmentSecrets,
  Branch,
  DIGEST_BITS,
  digestFits,
  helpfulElements,
  Joint,
  MAX_BRANCHES,
  severalGroups,
  type SolvedWays,
  solveJoint,
  withWays,
  type WorkBudget,
} from "./joint-solve.js";
import { ErrorCatalog, suppliedMessage } from "../core/error-catalog.js";

const ERRORS = new ErrorCatalog("sskr.joint-repair", {
  "readings-refused": suppliedMessage,
  "plan-joint-repair-refused": suppliedMessage,
  "share-repair-host-s-share-platform": {
    kind: "type",
    text: () => "A share repair needs the host's SharePlatform.",
  },
});

// This part's entry gives what its plans and repairs hold, and the digest width, as it did before
// the CORE-15 split moved them into joint-results.ts and joint-solve.ts, which have no entry of
// their own (AUD-024-API001).
export type {
  ElementHelp,
  JointAssessment,
  MarkedElement,
  RepairedSet,
  RepairedShares,
  RepairSearch,
  ShareAssessment,
} from "./joint-results.js";
export { DIGEST_BITS } from "./joint-solve.js";

/** Marked elements on one share. The other shares settle most of them; see the assessment. */
export const MAX_JOINT_MARKED_ELEMENTS = 64;

/**
 * Combinations that a search may try, 2^40 in all: they take weeks, and leave about 2^8 phrases
 * that pass by chance.
 */
export const MAX_SEARCH_BITS = 40;

/** The combinations that a repair may search, MAX_SEARCH_BITS as a count. */
export const MAX_REPAIR_COMBINATIONS = 2 ** MAX_SEARCH_BITS;

/**
 * Digest checks between two reports of progress, each followed by a look at the search's turns
 * (SearchTurns.due). A deliberate fast path: each check is a synchronous HMAC-SHA256 of a
 * microsecond or so, and asking for a turn after every one of up to 2^40 of them would add a
 * microtask to each.
 */
const TRIES_PER_PROGRESS = 16_384;

/** How far a search of marked shares has come: digest checks made, of all, and phrases found. */
export interface RepairProgress extends SearchProgress {
  readonly total: number;
}

/** How a host runs a search: its signal and turn (SearchRun), and its progress. */
export interface SearchOptions extends SearchRun {
  /** Called now and then with the checks made, of all, and the phrases found so far. */
  readonly onProgress?: ((progress: RepairProgress) => void) | undefined;
}

/**
 * A planned joint repair of marked shares: what was assessed, the search over what is open, and the
 * wipe of what it keeps of the secret.
 */
export interface JointPlan {
  readonly assessment: JointAssessment;
  /**
   * Tries every open combination; resolves with every phrase that passes, possibly none, and
   * whether the host stopped the search.
   */
  readonly search: (options?: SearchOptions) => Promise<RepairSearch>;
  /** Wipes what the search keeps of the shares' secret; the plan searches no more after it. */
  readonly wipe: () => void;
}

/** The phrases of `plan`'s one search; what the plan kept of the secret is wiped after it. */
export async function searchOnce(plan: JointPlan, options?: SearchOptions): Promise<RepairSearch> {
  try {
    return await plan.search(options);
  } finally {
    plan.wipe();
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
      throw ERRORS.create("readings-refused", [afterPlace("Share", place, AMBIGUOUS_MARK_WIDTHS)]);
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
    search: async () => NOTHING_SEARCHED,
    wipe: () => undefined,
  };
}

/** The search of a plan that refuses: nothing to try. */
const NOTHING_SEARCHED: RepairSearch = { sets: [], stopped: false };

/** Why an assessment that the host stopped plans nothing (verdict "stopped"). */
const STOPPED_REASON = "The assessment was stopped.";

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
 * combination, and whether some combination fits as far as its shares go.
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
  let ways: SolvedWays = { branches: [], needsMore: false, duplicates: false };
  let sameLength = false;
  const solved = (refused?: Solved["refused"]): Solved => ({
    ...ways,
    sameLength,
    ...(refused === undefined ? {} : { refused }),
  });
  const lengths = new Set(
    defined(spacesOf[0]).map((space) => space.reading.structure.payloadLength),
  );
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
const CODE_TRIALS = MAX_PARTIAL_UNIT_CANDIDATES;

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
    // The caller sees a stop in `turns`.
    if ((await turns.take()) === "stopped") return undefined;
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
  // A signal that is already aborted is heard at the first turn, before any share is read.
  const turns = SearchTurns.of(options);
  // The bound of every set of shares, before any record is read (AUD-012-API002).
  assertShareCount(records.length);
  const { platform, places } = options;
  const texts = Array.from(records, (record) => record.trim());
  for (const [index, text] of texts.entries()) {
    const problem = jointMarkLimitProblem(placeOf(places, index + 1), text);
    if (problem !== undefined) throw ERRORS.create("plan-joint-repair-refused", [problem]);
  }
  // A plan that can search keeps the arrays of its branches for its searches; every other array
  // made for the assessment is wiped, all of them when it is stopped (AUD-012-SEC004).
  const secrets = new AssessmentSecrets();
  let assessed: Assessed | undefined;
  try {
    const spacesOf: ReadingSpace[][] = [];
    for (const [index, text] of texts.entries()) {
      // A turn between the shares, however quick: reading one is quick, but many add up, and a
      // stop typed meanwhile is heard (SearchTurns.take): the assessment then plans nothing.
      if ((await turns.take()) === "stopped") return refusal([], "stopped", STOPPED_REASON);
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
    secrets.wipeAllBut(searched ? defined(assessed).kept : []);
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
    marks: markCount(defined(texts[index])),
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
  const plan = async (branches: readonly Branch[]): Promise<Assessed> => {
    const made = await planOf(shares, branches, platform, turns);
    return turns.stopped ? refuse("stopped", STOPPED_REASON) : { plan: made, kept: branches };
  };
  const unfit = spacesOf.findIndex((spaces) => spaces.length === 0);
  if (unfit >= 0) {
    const message = unreadableShareMessage(
      placeOf(places, unfit + 1),
      defined(shares[unfit]).marks,
      defined(texts[unfit]),
    );
    return refuse("no-fit", message, unfit + 1);
  }
  if (spacesOf.some(severalGroups))
    return refuse(
      "no-fit",
      "These shares belong to a set of several groups; only sets of one group are repaired.",
    );
  const solved = await solveReadings(spacesOf, turns, secrets);
  // A stop of the host while the readings were solved: what was solved is not planned.
  if (turns.stopped) return refuse("stopped", STOPPED_REASON);
  if (solved.refused !== undefined) {
    // The digits read of partly read codes may tell what the codes unknown as a whole cannot.
    const tried =
      solved.refused.verdict === "too-uncertain"
        ? await refined(spacesOf, Number.POSITIVE_INFINITY, turns, secrets)
        : undefined;
    if (turns.stopped) return refuse("stopped", STOPPED_REASON);
    if (tried === undefined) return refuse(solved.refused.verdict, solved.refused.reason);
    return plan(tried);
  }
  if (!solved.sameLength)
    return refuse("no-fit", "These shares are of different lengths: not of one set.");
  if (solved.branches.length === 0) {
    // No reading fits: the common rows fail for shares of another set, or for a misread
    // identifier or threshold, and more shares would not help.
    if (!solved.needsMore)
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
  if (turns.stopped) return refuse("stopped", STOPPED_REASON);
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
  if (tooOpen) return { assessment, search: async () => NOTHING_SEARCHED, wipe: () => undefined };
  return {
    assessment,
    search: (options) => searchBranches(branches, platform, options),
    wipe: () => wipeAll(branches.flatMap((branch) => branch.allSecretArrays())),
  };
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
): Promise<RepairSearch> {
  // A signal that is already aborted stops the search before any check.
  const turns = SearchTurns.of(options);
  if (turns.stopped) return { sets: [], stopped: true };
  const total = combinationsOf(branches);
  const found = new Map<string, RepairedSet>();
  const progress = (checked: number): RepairProgress => ({ checked, total, found: found.size });
  let done = 0;
  const tried = (): Promise<TurnState> | undefined => {
    done += 1;
    if (done % TRIES_PER_PROGRESS !== 0) return undefined;
    options.onProgress?.(progress(done));
    return turns.due();
  };
  const add = (repaired: RepairedSet): void => {
    const known = found.get(repaired.mnemonic);
    found.set(repaired.mnemonic, known === undefined ? repaired : merged(known, repaired));
  };
  for (const branch of branches) {
    await branch.searchDigest(platform, add, tried);
    // The sets found before a stop are given as such: only those (CORE-22).
    if (turns.stopped) return { sets: [...found.values()], stopped: true };
  }
  options.onProgress?.(progress(total));
  return { sets: [...found.values()], stopped: turns.stopped };
}

/**
 * One phrase from two candidates, such as a share all marked read with two member numbers: the
 * shares of the first are kept, and the elements in which the two differ are unsettled.
 */
function merged(first: RepairedSet, other: RepairedSet): RepairedSet {
  const differing = first.shares.flatMap((share, index) => {
    const second = defined(other.shares[index]);
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
 * `platform`, refused unless it has what a repair calls: the digest check and the restore of the
 * SSKR library. A host written in JavaScript may leave it out, which the types alone do not stop.
 */
function checkedPlatform(platform: SharePlatform | undefined): SharePlatform {
  if (typeof platform?.hmacSha256 !== "function" || typeof platform.combineShares !== "function")
    throw ERRORS.create("share-repair-host-s-share-platform", []);
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
