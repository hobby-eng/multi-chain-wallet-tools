import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "./crypto.js";
import { secureRandomBytes } from "./secure-random.js";

/**
 * A random BIP39 phrase that also meets a person's wishes: up to two chosen words, each at a
 * chosen position or anywhere, and a list of words never to use.
 *
 * Every phrase that meets the wishes is equally likely. The 11 bits of a word at a fixed
 * position other than the last are pure entropy, so they are set directly; a fixed last word
 * sets the entropy bits it carries and accepts only a draw whose checksum matches its other
 * bits. Everything else is rejection sampling: fresh randomness until the phrase fits. Setting
 * the checksum bits directly, or placing an "anywhere" word at a random position, would make
 * some phrases more likely than others.
 */

export type ChosenWordCount = 12 | 15 | 18 | 21 | 24;

/** A word the phrase must contain, at a 1-based position or anywhere. */
export interface ChosenWord {
  readonly word: string;
  readonly position: number | "anywhere";
}

export interface ChosenWordsRequest {
  readonly wordCount: ChosenWordCount;
  readonly chosen: readonly ChosenWord[];
  readonly neverUse: readonly string[];
}

export const MAX_CHOSEN_WORDS = 2;
/** Below this many random bits the page shows the yellow warning. */
export const CHOSEN_WORDS_WARNING_BITS = 112;
/** Below this many random bits the generator refuses. */
export const CHOSEN_WORDS_MINIMUM_BITS = 96;
/**
 * Most draws the generator expects to need before it refuses; a draw takes about 5 µs. The
 * rarest wishes allowed, two "anywhere" words in a 12-word phrase, need about 29,000.
 */
export const MAX_EXPECTED_DRAWS = 200_000;

const WORDLIST_SIZE = 2048;
const BITS_PER_WORD = 11;
/** Draws whose randomness is fetched in one call, so the CSPRNG is not called per draw. */
const DRAWS_PER_BATCH = 256;

/** BIP39: 4 checksum bits for 12 words up to 8 for 24 words, one for every three words. */
function checksumBits(wordCount: ChosenWordCount): number {
  return wordCount / 3;
}

function entropyBits(wordCount: ChosenWordCount): number {
  return wordCount * BITS_PER_WORD - checksumBits(wordCount);
}

const wordIndexes = new Map(wordlist.map((word, index) => [word, index]));

function wordIndex(word: string, label: string): number {
  const index = wordIndexes.get(word.trim().toLowerCase());
  // The word itself is not repeated: it is about to become part of a secret phrase.
  if (index === undefined) throw new Error(`${label} is not an English BIP39 word.`);
  return index;
}

interface Plan {
  readonly wordCount: ChosenWordCount;
  /** Word index by 0-based position, for words at a fixed position. */
  readonly fixed: ReadonlyMap<number, number>;
  readonly anywhere: readonly number[];
  readonly neverUse: ReadonlySet<number>;
}

function plan(request: ChosenWordsRequest): Plan {
  const { wordCount, chosen } = request;
  if (![12, 15, 18, 21, 24].includes(wordCount))
    throw new Error("BIP39 word count must be 12, 15, 18, 21, or 24.");
  if (chosen.length > MAX_CHOSEN_WORDS) throw new Error("Choose at most two words.");
  const neverUse = new Set(
    request.neverUse.map((word, index) => wordIndex(word, `Never-use word ${index + 1}`)),
  );
  const fixed = new Map<number, number>();
  const anywhere: number[] = [];
  const seen = new Set<number>();
  chosen.forEach((item, index) => {
    const label = `Chosen word ${index + 1}`;
    const value = wordIndex(item.word, label);
    if (seen.has(value)) throw new Error("Choose two different words.");
    seen.add(value);
    if (neverUse.has(value)) throw new Error(`${label} is also in the never-use list.`);
    if (item.position === "anywhere") {
      anywhere.push(value);
      return;
    }
    const position = item.position;
    if (!Number.isSafeInteger(position) || position < 1 || position > wordCount)
      throw new Error(`${label} needs a position from 1 to ${wordCount}.`);
    if (fixed.has(position - 1)) throw new Error(`Both chosen words are at position ${position}.`);
    fixed.set(position - 1, value);
  });
  return { wordCount, fixed, anywhere, neverUse };
}

/**
 * The chance that one draw meets the wishes, and the random bits that remain. The free
 * positions are treated as independent uniform words, which is exact for every position but
 * the last and very close for it; the page shows the result as "about".
 */
function odds(p: Plan): { readonly remainingBits: number; readonly expectedDraws: number } {
  const lastFixed = p.fixed.has(p.wordCount - 1);
  const free = p.wordCount - p.fixed.size;
  const allowed = WORDLIST_SIZE - p.neverUse.size;
  // Inclusion-exclusion over the "anywhere" words: every free word avoids the never-use list,
  // and each chosen word appears at least once.
  const avoid = (missing: number): number => ((allowed - missing) / WORDLIST_SIZE) ** free;
  const freeOdds =
    p.anywhere.length === 0
      ? avoid(0)
      : p.anywhere.length === 1
        ? avoid(0) - avoid(1)
        : avoid(0) - 2 * avoid(1) + avoid(2);
  const remainingBits =
    entropyBits(p.wordCount) - BITS_PER_WORD * p.fixed.size + Math.log2(freeOdds);
  // A fixed last word sets only its entropy bits; its checksum bits must also match.
  const checksumOdds = lastFixed ? 2 ** -checksumBits(p.wordCount) : 1;
  return { remainingBits, expectedDraws: 1 / (freeOdds * checksumOdds) };
}

/** The random bits left after the wishes, about; the full entropy when there are none. */
export function chosenWordsRemainingBits(request: ChosenWordsRequest): number {
  return odds(plan(request)).remainingBits;
}

function readBits(bytes: Uint8Array, start: number, count: number): number {
  let value = 0;
  for (let bit = start; bit < start + count; bit += 1)
    value = (value << 1) | ((bytes[bit >> 3]! >> (7 - (bit & 7))) & 1);
  return value;
}

function writeBits(bytes: Uint8Array, start: number, count: number, value: number): void {
  for (let offset = 0; offset < count; offset += 1) {
    const bit = start + offset;
    const mask = 1 << (7 - (bit & 7));
    if ((value >> (count - 1 - offset)) & 1) bytes[bit >> 3]! |= mask;
    else bytes[bit >> 3]! &= ~mask;
  }
}

/** The word indexes of the phrase for `entropy`, or null when it does not meet the wishes. */
function phraseIndexes(entropy: Uint8Array, p: Plan): number[] | null {
  const count = p.wordCount;
  const checksum = checksumBits(count);
  const indexes: number[] = [];
  for (let position = 0; position < count - 1; position += 1) {
    const index = readBits(entropy, position * BITS_PER_WORD, BITS_PER_WORD);
    if (p.neverUse.has(index)) return null;
    indexes.push(index);
  }
  const tail = readBits(entropy, (count - 1) * BITS_PER_WORD, BITS_PER_WORD - checksum);
  const hash = sha256(entropy);
  const last = (tail << checksum) | (hash[0]! >> (8 - checksum));
  hash.fill(0);
  if (p.neverUse.has(last)) return null;
  const fixedLast = p.fixed.get(count - 1);
  if (fixedLast !== undefined && fixedLast !== last) return null;
  indexes.push(last);
  if (!p.anywhere.every((index) => indexes.includes(index))) return null;
  return indexes;
}

export interface ChosenWordsOptions {
  /** Stops the search; the promise then rejects with the signal's reason. */
  readonly signal?: AbortSignal;
  /**
   * The source of random bytes. Only tests and the page self-test pass another one, to make a
   * search repeatable; a real phrase always uses secureRandomBytes.
   */
  readonly randomBytes?: (length: number) => Uint8Array;
}

/** Draws between two pauses that let the page handle input: about 50 ms of work. */
const DRAWS_PER_STEP = 10_000;

/** Lets the page handle input and paint between two steps of a search. */
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The search itself: draws until a phrase meets the wishes. It yields every DRAWS_PER_STEP draws,
 * where the caller may pause, and returns the phrase or throws when it runs out.
 */
function* search(
  request: ChosenWordsRequest,
  randomBytes: (length: number) => Uint8Array,
): Generator<void, string> {
  const p = plan(request);
  const { remainingBits, expectedDraws } = odds(p);
  if (remainingBits < CHOSEN_WORDS_MINIMUM_BITS)
    throw new Error(
      `These wishes leave about ${Math.floor(remainingBits)} random bits; at least ${CHOSEN_WORDS_MINIMUM_BITS} are required.`,
    );
  if (expectedDraws > MAX_EXPECTED_DRAWS)
    throw new Error(
      "These wishes are too rare to meet in reasonable time. Choose fewer or more common ones.",
    );

  const count = p.wordCount;
  const entropyBytes = entropyBits(count) / 8;
  const checksum = checksumBits(count);
  // Thirty times the expected number of draws: running out by bad luck has odds of e^-30.
  const drawLimit = Math.ceil(expectedDraws * 30);
  let batch: Uint8Array = new Uint8Array(0);
  try {
    for (let draw = 0; draw < drawLimit; draw += 1) {
      if (draw > 0 && draw % DRAWS_PER_STEP === 0) yield;
      const slot = draw % DRAWS_PER_BATCH;
      if (slot === 0) {
        batch.fill(0);
        batch = randomBytes(entropyBytes * DRAWS_PER_BATCH);
      }
      const entropy = batch.subarray(slot * entropyBytes, (slot + 1) * entropyBytes);
      for (const [position, index] of p.fixed) {
        if (position < count - 1)
          writeBits(entropy, position * BITS_PER_WORD, BITS_PER_WORD, index);
        // The last word carries the entropy's tail; its checksum bits are checked, not set.
        else
          writeBits(entropy, position * BITS_PER_WORD, BITS_PER_WORD - checksum, index >> checksum);
      }
      const indexes = phraseIndexes(entropy, p);
      if (indexes !== null) return indexes.map((index) => wordlist[index]!).join(" ");
    }
  } finally {
    batch.fill(0);
  }
  throw new Error("No phrase met these wishes in time. Generate again or choose fewer wishes.");
}

/**
 * A random phrase that meets the wishes, drawn with crypto.getRandomValues(). Refuses wishes
 * that leave fewer than CHOSEN_WORDS_MINIMUM_BITS random bits or would need too many draws. The
 * search pauses every DRAWS_PER_STEP draws, so the page stays responsive and can cancel it.
 */
export async function generateMnemonicWithChosenWords(
  request: ChosenWordsRequest,
  { signal, randomBytes = secureRandomBytes }: ChosenWordsOptions = {},
): Promise<string> {
  signal?.throwIfAborted();
  const steps = search(request, randomBytes);
  // The generator's finally block wipes its random bytes, also when the search is cancelled.
  try {
    for (let step = steps.next(); ; step = steps.next()) {
      if (step.done === true) return step.value;
      await pause();
      signal?.throwIfAborted();
    }
  } finally {
    steps.return("");
  }
}

/** The request and the byte stream of the page self-test: a word at a position and the last word. */
const SELF_TEST_REQUEST: ChosenWordsRequest = {
  wordCount: 12,
  chosen: [
    { word: "happy", position: 1 },
    { word: "zoo", position: 12 },
  ],
  neverUse: ["abandon"],
};

/** Start value of the self-test's byte stream; any fixed non-zero value works. */
const SELF_TEST_SEED = 0x2545f491;

/**
 * The phrase the search finds for a fixed request and a fixed byte stream, for the page
 * self-test: it checks the bit placement, the wait for the last word's checksum and the
 * never-use rule without randomness. The stream is xorshift32 (Marsaglia, 2003): repeatable and
 * varied enough, and never used for a real phrase.
 */
export function chosenWordsSelfTestPhrase(): string {
  let state = SELF_TEST_SEED;
  const fixedBytes = (length: number): Uint8Array =>
    Uint8Array.from({ length }, () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state & 255;
    });
  const steps = search(SELF_TEST_REQUEST, fixedBytes);
  for (let step = steps.next(); ; step = steps.next()) if (step.done === true) return step.value;
}
