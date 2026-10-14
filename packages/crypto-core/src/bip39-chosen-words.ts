import {
  BIP39_WORD_BITS,
  assertBip39WordCount,
  bip39ChecksumBits,
  bip39EntropyBits,
  bip39EntropyBytes,
  type Bip39WordCount,
} from "./bip39-parameters.js";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "./crypto.js";
import { secureRandomBytes } from "./secure-random.js";
import { CheckedRandomByteSource, type RandomBytes } from "./random-byte-source.js";
import { ENGLISH_BIP39_WORDS } from "./bip39-word-reader.js";

/**
 * A random BIP39 phrase that also meets a person's wishes: a chosen word, at a chosen position or
 * anywhere, and a list of words never to use.
 *
 * Every phrase that meets the wishes is equally likely. The 11 bits of a word at a fixed
 * position other than the last are pure entropy, so they are set directly; a fixed last word
 * sets the entropy bits it carries and accepts only a draw whose checksum matches its other
 * bits. Everything else is rejection sampling: fresh randomness until the phrase fits. Setting
 * the checksum bits directly, or placing an "anywhere" word at a random position, would make
 * some phrases more likely than others.
 */

export type ChosenWordCount = Bip39WordCount;

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

/*
 * The most chosen words and words never to use a new phrase takes, at every length: one each
 * (owner's decisions, 2026-10-08). Deliberate copies of mhfe's limits (word_wishes, its browser
 * package's parameters().maxChosenWords and maxNeverUseWords): this generator also runs in builds
 * without MHFE, so it cannot read them there. tooling/verify-mhfe-vector.mjs keeps them in step.
 * With them a 12-word phrase keeps at least about 117 random bits and needs at most about 256
 * draws on average, so no wish needs a floor of bits or of draws.
 */
export const MOST_CHOSEN_WORDS = 1;
export const MOST_NEVER_USE_WORDS = 1;

const WORDLIST_SIZE = 2 ** BIP39_WORD_BITS;
/** Draws whose randomness is fetched in one call, so the CSPRNG is not called per draw. */
const DRAWS_PER_BATCH = 256;

/** "1 word" or "2 words", as mhfe words its limits. */
function atMost(count: number): string {
  return `${count} word${count === 1 ? "" : "s"}`;
}

function wordIndex(word: string, label: string): number {
  // The word itself is not repeated: it is about to become part of a secret phrase.
  return ENGLISH_BIP39_WORDS.index(word, label);
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
  assertBip39WordCount(wordCount);
  if (chosen.length > MOST_CHOSEN_WORDS)
    throw new Error(`Choose at most ${atMost(MOST_CHOSEN_WORDS)}.`);
  if (request.neverUse.length > MOST_NEVER_USE_WORDS)
    throw new Error(`Name at most ${atMost(MOST_NEVER_USE_WORDS)} never to use.`);
  const neverUse = new Set(
    request.neverUse.map((word, index) => wordIndex(word, `Never-use word ${index + 1}`)),
  );
  const fixed = new Map<number, number>();
  const anywhere: number[] = [];
  chosen.forEach((item, index) => {
    const label = `Chosen word ${index + 1}`;
    const value = wordIndex(item.word, label);
    if (neverUse.has(value)) throw new Error(`${label} is also in the never-use list.`);
    if (item.position === "anywhere") {
      anywhere.push(value);
      return;
    }
    const position = item.position;
    if (!Number.isSafeInteger(position) || position < 1 || position > wordCount)
      throw new Error(`${label} needs a position from 1 to ${wordCount}.`);
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
  // With at most one chosen word, subtract draws in which that word never appears.
  const avoid = (missing: number): number => ((allowed - missing) / WORDLIST_SIZE) ** free;
  const freeOdds = p.anywhere.length === 0 ? avoid(0) : avoid(0) - avoid(1);
  const remainingBits =
    bip39EntropyBits(p.wordCount) - BIP39_WORD_BITS * p.fixed.size + Math.log2(freeOdds);
  // A fixed last word sets only its entropy bits; its checksum bits must also match.
  const checksumOdds = lastFixed ? 2 ** -bip39ChecksumBits(p.wordCount) : 1;
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

/**
 * Sets the bits of the words at fixed positions in a drawn `entropy`: all 11 of a word but the
 * last, and of the last only its entropy bits, as its checksum bits come from the hash, as mhfe's
 * WordWishes.apply does. The search calls it for every draw; the page self-test checks it at every
 * position of every length against an independent oracle.
 */
function applyFixedWords(entropy: Uint8Array, p: Plan): void {
  const checksum = bip39ChecksumBits(p.wordCount);
  for (const [position, index] of p.fixed) {
    if (position < p.wordCount - 1)
      writeBits(entropy, position * BIP39_WORD_BITS, BIP39_WORD_BITS, index);
    else
      writeBits(entropy, position * BIP39_WORD_BITS, BIP39_WORD_BITS - checksum, index >> checksum);
  }
}

/** The word indexes of the phrase for `entropy`, or null when it does not meet the wishes. */
function phraseIndexes(entropy: Uint8Array, p: Plan): number[] | null {
  const count = p.wordCount;
  const checksum = bip39ChecksumBits(count);
  const indexes: number[] = [];
  for (let position = 0; position < count - 1; position += 1) {
    const index = readBits(entropy, position * BIP39_WORD_BITS, BIP39_WORD_BITS);
    if (p.neverUse.has(index)) return null;
    indexes.push(index);
  }
  const tail = readBits(entropy, (count - 1) * BIP39_WORD_BITS, BIP39_WORD_BITS - checksum);
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
  /** Already aborted, the search does not start; the promise then rejects with its reason. */
  readonly signal?: AbortSignal;
  /**
   * The source of random bytes. Only tests and the page self-test pass another one, to make a
   * search repeatable; a real phrase always uses secureRandomBytes.
   */
  readonly randomBytes?: RandomBytes;
}

/** The search itself: draws until a phrase meets the wishes, or throws when it runs out. */
function search(request: ChosenWordsRequest, randomBytes: RandomBytes): string {
  const source = new CheckedRandomByteSource(randomBytes);
  const p = plan(request);
  const { expectedDraws } = odds(p);

  const entropyBytes = bip39EntropyBytes(p.wordCount);
  // Thirty times the expected number of draws: running out by bad luck has odds of e^-30.
  const drawLimit = Math.ceil(expectedDraws * 30);
  let batch: Uint8Array = new Uint8Array(0);
  try {
    for (let draw = 0; draw < drawLimit; draw += 1) {
      const slot = draw % DRAWS_PER_BATCH;
      if (slot === 0) {
        batch.fill(0);
        batch = source.bytes(entropyBytes * DRAWS_PER_BATCH);
      }
      const entropy = batch.subarray(slot * entropyBytes, (slot + 1) * entropyBytes);
      applyFixedWords(entropy, p);
      const indexes = phraseIndexes(entropy, p);
      if (indexes !== null) return indexes.map((index) => wordlist[index]!).join(" ");
    }
  } finally {
    batch.fill(0);
  }
  throw new Error("No phrase met these wishes in time. Generate again or choose fewer wishes.");
}

/**
 * A random phrase that meets the wishes, drawn with crypto.getRandomValues(). The wishes allowed
 * need about 256 draws at most, milliseconds of work, so the search runs in one go; a signal
 * already aborted stops it before it starts.
 */
export async function generateMnemonicWithChosenWords(
  request: ChosenWordsRequest,
  { signal, randomBytes = secureRandomBytes }: ChosenWordsOptions = {},
): Promise<string> {
  signal?.throwIfAborted();
  return search(request, randomBytes);
}

/**
 * Known answers of the page self-test: requests, and the phrases that an independent whole-integer
 * oracle (BigInt fields and Node's SHA-256, bip39-chosen-words-boundaries.test.ts) draws for them
 * from the self-test's byte stream, each read from its start. Between them they put a chosen word
 * first, in the middle, across three bytes, anywhere and last, at every length, with all-ones and
 * mixed last-word bits, and two of them refuse the first draw for a word never to use, once at the
 * first position. The search must draw each phrase itself (AUD-025 follow-up).
 */
export const CHOSEN_WORDS_KNOWN_ANSWERS: readonly {
  readonly label: string;
  readonly request: ChosenWordsRequest;
  readonly phrase: string;
}[] = [
  {
    label: "last word of all ones and a word never to use",
    request: { wordCount: 24, chosen: [{ word: "zoo", position: 24 }], neverUse: ["abandon"] },
    phrase:
      "unique film envelope lazy jelly tennis flame flash melody news kangaroo health wife " +
      "sure sort invest laugh friend clock reform border put october zoo",
  },
  {
    // The first draw holds "frost" second.
    label: "first word and a word never to use",
    request: { wordCount: 24, chosen: [{ word: "happy", position: 1 }], neverUse: ["frost"] },
    phrase:
      "happy buyer glide special riot dynamic guard shrimp pole zebra nice wood bacon swing live " +
      "exercise nest fence beach license that caution cricket oven",
  },
  {
    // The first draw holds "deny" first.
    label: "middle word and a first word never to use",
    request: { wordCount: 18, chosen: [{ word: "fetch", position: 9 }], neverUse: ["deny"] },
    phrase:
      "hundred slice process fiscal lion bleak crime laundry fetch duck trim basket output broom " +
      "oyster wrestle field utility",
  },
  {
    // Bits 22 to 32, in bytes 2, 3 and 4.
    label: "word across three bytes",
    request: { wordCount: 15, chosen: [{ word: "primary", position: 3 }], neverUse: [] },
    phrase:
      "deny frost primary furnace coyote december rather close country sea quality place vital " +
      "mule involve",
  },
  {
    // The first two draws lack "host"; the third holds it second.
    label: "word anywhere",
    request: { wordCount: 21, chosen: [{ word: "host", position: "anywhere" }], neverUse: [] },
    phrase:
      "park host cherry wish network hour describe blame allow muscle apart network achieve " +
      "hurdle version unable soon awake edge blush ridge",
  },
  {
    // "primary" is 10101010101: its 7 entropy bits and 4 checksum bits are mixed.
    label: "12-word last word of mixed bits",
    request: { wordCount: 12, chosen: [{ word: "primary", position: 12 }], neverUse: [] },
    phrase: "best enrich then define observe boring cross pitch diary battle undo primary",
  },
];

/** Start value of the self-test's byte stream; any fixed non-zero value works. */
const SELF_TEST_SEED = 0x2545f491;

// Independent BIP39 geometry and public zero-entropy answers. Node's crypto SHA-256 reproduces
// Trezor's first English vector (last index 3, "about"), then gives these last indexes at every
// permitted length. AUD-025 retains that independent computation; none uses this module's hash.
const SELF_TEST_GEOMETRIES = [
  { wordCount: 12, entropyBits: 128, checksumBits: 4, lastIndex: 3 },
  { wordCount: 15, entropyBits: 160, checksumBits: 5, lastIndex: 27 },
  { wordCount: 18, entropyBits: 192, checksumBits: 6, lastIndex: 39 },
  { wordCount: 21, entropyBits: 224, checksumBits: 7, lastIndex: 29 },
  { wordCount: 24, entropyBits: 256, checksumBits: 8, lastIndex: 102 },
] as const;

/** The extremes and each independent bit of a published BIP39 11-bit word index. */
const SELF_TEST_INDEXES = [0, 2047, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024] as const;

function selfTestExpect(condition: boolean, rule: string): void {
  if (!condition) throw new Error(`BIP39 chosen-word self-test failed: ${rule}.`);
}

/**
 * Independent oracle: replace an entire field in a 24-bit window using division and arithmetic,
 * unlike the production reader and writer's bit-by-bit masks. Three bytes cover an 11-bit field
 * from every byte offset; bytes beyond the entropy are deliberately not written.
 */
function selfTestWindow(
  before: Uint8Array,
  start: number,
  width: number,
  value: number,
): Uint8Array {
  const expected = before.slice();
  const first = Math.floor(start / 8);
  const scale = 2 ** (24 - (start % 8) - width);
  const radix = 2 ** width;
  let window = 0;
  for (let offset = 0; offset < 3; offset += 1)
    window = window * 256 + (before[first + offset] ?? 0);
  window += (value - (Math.floor(window / scale) % radix)) * scale;
  for (let offset = 0; offset < 3 && first + offset < expected.length; offset += 1)
    expected[first + offset] = Math.floor(window / 2 ** (16 - offset * 8)) % 256;
  return expected;
}

/** The plan of one chosen word, `index`, at 0-based `position` of a phrase of `wordCount` words. */
function selfTestWordAt(wordCount: Bip39WordCount, position: number, index: number): Plan {
  return plan({
    wordCount,
    chosen: [{ word: wordlist[index]!, position: position + 1 }],
    neverUse: [],
  });
}

/**
 * The search's own steps at every position of every length, against the independent oracle: the
 * placement of a chosen word (applyFixedWords) with its neighboring bits, the reading of each word
 * back (phraseIndexes), and the refusal of a word never to use wherever it stands.
 */
function selfTestBitWindows(): void {
  selfTestExpect(BIP39_WORD_BITS === 11, "word width");
  for (const { wordCount, entropyBits, checksumBits } of SELF_TEST_GEOMETRIES) {
    selfTestExpect(bip39EntropyBits(wordCount) === entropyBits, "entropy width");
    selfTestExpect(bip39ChecksumBits(wordCount) === checksumBits, "checksum width");
    const noWishes = plan({ wordCount, chosen: [], neverUse: [] });
    const zooExcluded = plan({ wordCount, chosen: [], neverUse: ["zoo"] });
    for (let position = 0; position < wordCount; position += 1) {
      const last = position === wordCount - 1;
      const width = last ? 11 - checksumBits : 11;
      for (const index of SELF_TEST_INDEXES)
        for (const byte of [0, 255]) {
          const before = new Uint8Array(entropyBits / 8).fill(byte);
          const value = last ? Math.floor(index / 2 ** checksumBits) : index;
          const expected = selfTestWindow(before, position * 11, width, value);
          const actual = before.slice();
          applyFixedWords(actual, selfTestWordAt(wordCount, position, index));
          selfTestExpect(
            actual.every((item, at) => item === expected[at]),
            "entropy bit placement and neighboring bytes",
          );
          // The reader sees an oracle fixture, not the writer's output: an inverse pair of bugs
          // cannot pass by cancelling each other, including the last word's shorter entropy tail.
          const read = phraseIndexes(expected, noWishes);
          selfTestExpect(
            read !== null && read[position]! >> (last ? checksumBits : 0) === value,
            "independently placed entropy bits",
          );
        }
      // A word never to use is refused wherever it stands; the last word is checked with the
      // public zero-entropy answers below.
      if (!last)
        selfTestExpect(
          phraseIndexes(
            selfTestWindow(new Uint8Array(entropyBits / 8), position * 11, 11, 2047),
            zooExcluded,
          ) === null,
          "excluded word at every position",
        );
    }
  }
}

function selfTestRefusal(request: ChosenWordsRequest, expected: string): void {
  let refused = false;
  try {
    plan(request);
  } catch (cause) {
    if (!(cause instanceof Error) || cause.message !== expected) throw cause;
    refused = true;
  }
  selfTestExpect(refused, "invalid wishes must be refused");
}

function selfTestPredicates(): void {
  for (const { wordCount, entropyBits, checksumBits, lastIndex } of SELF_TEST_GEOMETRIES) {
    const entropy = new Uint8Array(entropyBits / 8);
    const request: ChosenWordsRequest = { wordCount, chosen: [], neverUse: [] };
    const indexes = phraseIndexes(entropy, plan(request));
    selfTestExpect(
      indexes !== null &&
        indexes.length === wordCount &&
        indexes.slice(0, -1).every((index) => index === 0) &&
        indexes[wordCount - 1] === lastIndex,
      "public zero-entropy word indexes and checksum",
    );
    const hasLast = (index: number): Plan =>
      plan({ ...request, chosen: [{ word: wordlist[index]!, position: wordCount }] });
    selfTestExpect(phraseIndexes(entropy, hasLast(lastIndex)) !== null, "matching final checksum");
    // Only the low checksum bit changes: the requested entropy tail is unchanged, but this
    // last word must be refused. The matching companion above prevents an always-null verifier.
    const wrongChecksum = lastIndex ^ 1;
    selfTestExpect(
      Math.floor(wrongChecksum / 2 ** checksumBits) === Math.floor(lastIndex / 2 ** checksumBits),
      "negative fixture keeps the entropy tail",
    );
    selfTestExpect(
      phraseIndexes(entropy, hasLast(wrongChecksum)) === null,
      "wrong final checksum is refused",
    );
    const avoiding = (word: string): Plan => plan({ ...request, neverUse: [word] });
    selfTestExpect(phraseIndexes(entropy, avoiding("zoo")) !== null, "absent excluded word");
    selfTestExpect(phraseIndexes(entropy, avoiding("abandon")) === null, "excluded prefix word");
    selfTestExpect(
      phraseIndexes(entropy, avoiding(wordlist[lastIndex]!)) === null,
      "excluded final word",
    );
    const anywhere = (word: string): Plan =>
      plan({ ...request, chosen: [{ word, position: "anywhere" }] });
    selfTestExpect(phraseIndexes(entropy, anywhere("abandon")) !== null, "present anywhere word");
    selfTestExpect(
      phraseIndexes(entropy, anywhere(wordlist[lastIndex]!)) !== null,
      "final anywhere word",
    );
    selfTestExpect(phraseIndexes(entropy, anywhere("zoo")) === null, "absent anywhere word");
    selfTestRefusal(
      { ...request, chosen: [{ word: "notaword", position: 1 }] },
      "Chosen word 1 is not an English BIP39 word.",
    );
    selfTestRefusal(
      { ...request, chosen: [{ word: "happy", position: wordCount + 1 }] },
      `Chosen word 1 needs a position from 1 to ${wordCount}.`,
    );
    selfTestRefusal(
      { ...request, chosen: [{ word: "happy", position: 1 }], neverUse: ["happy"] },
      "Chosen word 1 is also in the never-use list.",
    );
    selfTestRefusal(
      {
        ...request,
        chosen: [
          { word: "happy", position: 1 },
          { word: "river", position: "anywhere" },
        ],
      },
      "Choose at most 1 word.",
    );
    selfTestRefusal(
      { ...request, neverUse: ["abandon", "zoo"] },
      "Name at most 1 word never to use.",
    );
  }
}

/**
 * The self-test's byte stream from its start: xorshift32 (Marsaglia, 2003), repeatable and varied
 * enough, and never used for a real phrase; no startup case calls the host random source.
 */
function selfTestStream(): (length: number) => Uint8Array {
  let state = SELF_TEST_SEED;
  return (length) =>
    Uint8Array.from({ length }, () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state & 255;
    });
}

/**
 * The page self-test of the generator: independent bit placement and readback and the true and
 * false predicate checks at every length, then the known answers, each drawn by the search itself
 * from the fixed stream, so that the placement of a chosen word in a real draw is checked too.
 * Throws, naming the rule, when one fails.
 */
export function runChosenWordsSelfTest(): void {
  selfTestBitWindows();
  selfTestPredicates();
  for (const { label, request, phrase } of CHOSEN_WORDS_KNOWN_ANSWERS)
    selfTestExpect(search(request, selfTestStream()) === phrase, `known phrase with a ${label}`);
}
