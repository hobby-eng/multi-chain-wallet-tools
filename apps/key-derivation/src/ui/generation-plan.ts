// What Generate & Derive draws when its generation options are combined, and every line it shows
// about the draw: the conditions a phrase must pass (TON's check, the MHFE wallet check), the
// draws they take on average, the random bits they keep, and the start, progress, stop and done
// lines. Each condition brings its own words, so that a build without TON or MHFE carries none of
// theirs. Pure: generation-progress.ts shows the lines, phrase-generation.ts runs the draw.
import { checkedDrawOdds, type ChosenWordsRequest } from "@ckd/core/bip39-chosen-words.js";
import { bip39EntropyBits } from "@ckd/core/bip39-parameters.js";
import type { Bip39WordCount } from "@ckd/core/bip39-word-counts.js";
import { englishList } from "@ckd/core/listing.js";
import { formatDuration } from "./recovery-progress.js";

/** A condition that a drawn phrase must pass besides the chosen words. */
export interface GenerationCondition {
  /** What the phrase does, after "a phrase that": "the Telegram wallet accepts". */
  readonly goal: string;
  /** The condition where the bits it takes are counted: "TON's check". */
  readonly name: string;
  /** The random bits it takes: one phrase in 2^bits passes. */
  readonly bits: number;
  /** The length of the phrases it draws: Generate offers no other while it is chosen. */
  readonly words: Bip39WordCount;
  /** What someone who keeps a BIP39 passphrase with the phrase must know of it, if anything. */
  readonly passphraseNote?: string;
}

/** A condition that the wallet check's workers try first (TON's), and the page's check of it. */
export interface WorkerPrecheck extends GenerationCondition {
  /** The page's check of a drawn phrase, by another implementation, before it is shown. */
  readonly passes: (phrase: string) => boolean;
}

/** One press of a Generate button with the options ticked. */
export interface GenerationPlan {
  readonly words: number;
  /** Whether a chosen word or a word never to use shapes the draw. */
  readonly wishes: boolean;
  /** The conditions in the order they are tried: the cheaper first. */
  readonly conditions: readonly GenerationCondition[];
}

/** How fast this computer draws, as the wallet check's workers measure it before a draw. */
export type DrawSpeedState =
  | { readonly kind: "measuring"; readonly threads: number }
  | { readonly kind: "measured"; readonly threads: number; readonly drawsPerSecond: number }
  | { readonly kind: "failed" };

const MILLISECONDS_PER_SECOND = 1000;
const HOUR_MILLISECONDS = 3_600_000;
/**
 * The draws are tries of a geometric distribution: a search lasts longer than k times its average
 * with odds of about e^-k, so 1 search in 20 lasts more than ln 20 ≈ 3 times the average.
 */
const ONE_IN_TWENTY_FACTOR = Math.log(20);
/** Draws on average from which a search not measured yet can take hours on a usual computer. */
const HOURS_LIKELY_DRAWS = 2 ** 20;

/** The draws a phrase takes on average under `conditions`: their odds multiply. */
export function expectedDraws(conditions: readonly GenerationCondition[]): number {
  return 2 ** conditions.reduce((sum, condition) => sum + condition.bits, 0);
}

/** What the phrase must do: " that meets your chosen words and that the Telegram wallet …". */
function goals(plan: GenerationPlan): string {
  const clauses = [
    ...(plan.wishes ? ["meets your chosen words"] : []),
    ...plan.conditions.map((condition) => condition.goal),
  ].map((goal) => `that ${goal}`);
  return clauses.length === 0 ? "" : ` ${englishList(clauses)}`;
}

function count(draws: number): string {
  return draws.toLocaleString("en-US");
}

function threads(count: number): string {
  return `${count} thread${count === 1 ? "" : "s"}`;
}

/** Below this a time is read to a tenth of a second, which a quick draw needs to say anything. */
const TENTHS_BELOW_MILLISECONDS = 10_000;
const MILLISECONDS_PER_TENTH = 100;

/** A time to read: "0.4 s" for a quick one, else formatDuration's "1 min 6 s" or "2 h 30 min". */
function time(milliseconds: number): string {
  if (milliseconds >= TENTHS_BELOW_MILLISECONDS) return formatDuration(milliseconds);
  const tenths = Math.floor(milliseconds / MILLISECONDS_PER_TENTH);
  return `${(tenths / 10).toFixed(1)} s`;
}

/** The line shown as soon as a Generate button is pressed. */
export function drawStartLine(plan: GenerationPlan): string {
  const phrase = `Drawing a new ${plan.words}-word phrase${goals(plan)}`;
  return plan.conditions.length === 0
    ? `${phrase}.`
    : `${phrase}: about ${count(expectedDraws(plan.conditions))} draws.`;
}

/**
 * The line of a draw in progress. Once its speed is known (DrawPace), it also says how long the
 * draws a phrase takes on average last at that speed: an estimate, not a countdown.
 */
export function drawCountLine(
  draws: number,
  elapsedMs: number,
  expected: number,
  perMillisecond: number | undefined,
): string {
  const line = `${count(draws)} tried · ${time(elapsedMs)} elapsed`;
  if (perMillisecond === undefined || perMillisecond <= 0) return line;
  return `${line} · about ${time(expected / perMillisecond)} on average at this speed`;
}

/** The span of a draw's latest reports that its speed is taken over. */
const PACE_WINDOW_MS = 10_000;
/** No speed before the reports span this long: the first seconds are not steady yet. */
const PACE_SETTLED_MS = 2_000;

/**
 * The speed of a running draw from its progress reports, over a sliding window that starts at the
 * first report: the time before it (MHFE's check, the workers' start, draws not reported yet) does
 * not count.
 */
export class DrawPace {
  readonly #reports: { readonly at: number; readonly draws: number }[] = [];

  /** Records `draws` tried by the time `at`; the draws per millisecond, undefined while too early. */
  add(at: number, draws: number): number | undefined {
    const reports = this.#reports;
    reports.push({ at, draws });
    // The oldest report kept is the last one at least a window old.
    while (reports.length > 2 && at - (reports[1]?.at ?? at) >= PACE_WINDOW_MS) reports.shift();
    const first = reports[0];
    if (first === undefined || at - first.at < PACE_SETTLED_MS) return undefined;
    return (draws - first.draws) / (at - first.at);
  }
}

/** The line of a draw that Stop or a changed input ended. */
export function drawStoppedLine(draws: number, elapsedMs: number): string {
  if (draws === 0) return "Stopped before the first draw. No phrase was taken.";
  return `Stopped after ${count(draws)} draws in ${time(elapsedMs)}. No phrase was taken.`;
}

/** What the page did with the person's BIP39 passphrase when it showed the new phrase. */
export type PassphraseOutcome = "none" | "emptied" | "kept";

/** The line once the new phrase is in the phrase field. */
export function drawDoneLine(
  plan: GenerationPlan,
  draws: number,
  elapsedMs: number,
  passphrase: PassphraseOutcome,
): string {
  const tries =
    plan.conditions.length === 0 ? "" : ` after ${count(draws)} draws in ${time(elapsedMs)}`;
  const notes =
    passphrase === "kept"
      ? plan.conditions.flatMap((condition) => condition.passphraseNote ?? [])
      : passphrase === "emptied"
        ? [
            "The BIP39 passphrase field was emptied: a new phrase starts without one; type one now if this wallet should use one.",
          ]
        : [];
  return [
    `Generated a new ${plan.words}-word BIP39 recovery phrase with crypto.getRandomValues()${goals(plan)}${tries}.`,
    ...notes,
  ].join(" ");
}

/**
 * What a phrase drawn with the conditions and `wishes` keeps of its random bits, in the words of
 * mhfe new before 0.8.0 (src/bin/mhfe/chosen_words.rs, tell). `alert` marks a phrase that is not
 * recommended. Throws as the generator does for wishes it refuses.
 */
export function bitsOutlook(
  wishes: ChosenWordsRequest,
  conditions: readonly GenerationCondition[],
): { readonly text: string; readonly alert: boolean } {
  const odds = checkedDrawOdds(
    wishes,
    conditions.reduce((sum, condition) => sum + condition.bits, 0),
  );
  const kept = Math.floor(odds.randomBits + 1e-9);
  const total = bip39EntropyBits(wishes.wordCount);
  const taken = conditions.map((condition) => `${condition.bits} for ${condition.name}`);
  if (odds.randomness === "ample")
    return {
      text: `The phrase keeps about ${kept} of its ${total} random bits (${englishList(taken)}): still far more than enough.`,
      alert: false,
    };
  return {
    text:
      `Not recommended: the phrase keeps about ${kept} of its ${total} random bits ` +
      `(${englishList([...taken, "the rest for your words"])}), fewer than ${odds.recommendedBits}.` +
      // The advice fits only a word asked for at a fixed position.
      (odds.fixedPosition
        ? " A word anywhere in the phrase keeps more than one at a fixed position."
        : ""),
    alert: true,
  };
}

/**
 * How long a phrase takes on this computer under `conditions`, said before the draw starts: the
 * chosen words do not change it.
 */
export function timeOutlook(
  speed: DrawSpeedState,
  conditions: readonly GenerationCondition[],
): string {
  const expected = expectedDraws(conditions);
  if (speed.kind !== "measured") {
    const hours = expected >= HOURS_LIKELY_DRAWS ? " It can take hours." : "";
    return speed.kind === "measuring"
      ? `Measuring this computer's speed with ${threads(speed.threads)}…${hours}`
      : `This computer's speed could not be measured; the draw shows it once it runs.${hours}`;
  }
  const average = (expected / speed.drawsPerSecond) * MILLISECONDS_PER_SECOND;
  const longer = average * ONE_IN_TWENTY_FACTOR;
  return (
    `On this computer with ${threads(speed.threads)}, a phrase takes about ${time(average)} on ` +
    `average. The time varies, with no fixed end: 1 search in 20 takes more than ${time(longer)}.` +
    (longer >= HOUR_MILLISECONDS ? " It can take hours; Stop works at any time." : "")
  );
}
