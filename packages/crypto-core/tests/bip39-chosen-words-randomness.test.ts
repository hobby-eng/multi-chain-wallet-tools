// Guards against a silent loss of randomness in the chosen-word generator (owner's request,
// 2026-10-08): a phrase from weak entropy is still a valid BIP39 phrase, since the checksum is
// calculated from whatever entropy results (Milk Sad, CVE-2023-39910; the Trust Wallet browser
// extension, CVE-2023-31290). Fixed-seed samples are reproducible regression controls, not proof
// of cryptographic entropy. Unit tests only; the page's startup suite has separate known answers.
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, it } from "vitest";
import {
  generateMnemonicWithChosenWords,
  type ChosenWordCount,
  type ChosenWordsRequest,
} from "../src/bip39-chosen-words.js";

/** Start value of the xorshift32 stream that mhfe's known answers share. */
const STREAM_SEED = 0x2545f491;
const PHRASE_WORDS = 24;
const WORD_BITS = 11;
const WORDS = 2 ** WORD_BITS;
const WORD_COUNTS: readonly ChosenWordCount[] = [12, 15, 18, 21, 24];
/** Phrases drawn for each wish set of the statistics. */
const SAMPLES = 20_000;
/** Smaller cases group 32 adjacent word indexes, keeping expected bin counts above fifty. */
const SMALL_SAMPLES = 4096;
const GROUPED_BINS = 64;
/** Standard deviations a frequency may stray from its expected value. */
const SIGMAS = 5;
/**
 * A normal quantile for the Wilson-Hilferty approximation to each chi-square-model tail.
 * This is approximate and per comparison, not an exact multinomial or suite-wide error rate.
 */
const Z_ONE_IN_A_MILLION = 4.753;

/** The xorshift32 stream (Marsaglia, 2003), one byte a step as the page self-test reads it. */
class Xorshift32 {
  #state: number;

  constructor(seed = STREAM_SEED) {
    this.#state = seed;
  }

  bytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    let state = this.#state;
    for (let index = 0; index < length; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      bytes[index] = state & 255;
    }
    this.#state = state;
    return bytes;
  }
}

function bit(bytes: Uint8Array, index: number): number {
  return (bytes[index >> 3]! >> (7 - (index & 7))) & 1;
}

function entropyOf(phrase: string): Uint8Array {
  return mnemonicToEntropy(phrase, wordlist);
}

/** Independent published BIP39 geometry: one checksum bit per three words, 11 bits per word. */
function entropyBits(wordCount: ChosenWordCount): number {
  return wordCount * WORD_BITS - wordCount / 3;
}

function wordBits(
  wordCount: ChosenWordCount,
  position: number,
): { readonly from: number; readonly to: number } {
  const from = (position - 1) * WORD_BITS;
  return { from, to: Math.min(from + WORD_BITS, entropyBits(wordCount)) };
}

const WORD_INDEXES = new Map(wordlist.map((word, index) => [word, index]));

interface Sample {
  readonly entropy: Uint8Array;
  readonly words: Uint16Array;
}

class Drawn {
  readonly wordCount: ChosenWordCount;
  #samples: Sample[] = [];

  constructor(wordCount: ChosenWordCount) {
    this.wordCount = wordCount;
  }

  get samples(): readonly Sample[] {
    return this.#samples;
  }

  push(phrase: string): void {
    // @scure's decoder independently checks the checksum and reconstructs the entropy.
    const entropy = entropyOf(phrase);
    const words = Uint16Array.from(phrase.split(" "), (word) => WORD_INDEXES.get(word)!);
    this.#samples.push({ entropy, words });
  }

  changed(change: (entropy: Uint8Array) => void): Drawn {
    const changed = new Drawn(this.wordCount);
    for (const sample of this.#samples) {
      const entropy = sample.entropy.slice();
      change(entropy);
      changed.push(entropyToMnemonic(entropy, wordlist));
    }
    return changed;
  }
}

/** Whether `count` of `samples` lies within SIGMAS standard deviations of probability `p`. */
function frequencyWithin(count: number, samples: number, p: number): boolean {
  const sigma = Math.sqrt((p * (1 - p)) / samples);
  return Math.abs(count / samples - p) <= SIGMAS * sigma;
}

/**
 * Pearson counts with Wilson-Hilferty bounds targeting approximately 1e-6 per model tail.
 * Finite multinomial counts and multiple comparisons have no exact error guarantee here.
 */
function probabilityCounts(counts: readonly number[], probabilities: readonly number[]): boolean {
  const total = counts.reduce((sum, count) => sum + count, 0);
  let statistic = 0;
  let bins = 0;
  for (const [index, count] of counts.entries()) {
    const expected = total * probabilities[index]!;
    if (expected === 0) {
      if (count !== 0) return false;
      continue;
    }
    statistic += (count - expected) ** 2 / expected;
    bins += 1;
  }
  const freedom = bins - 1;
  if (total === 0 || freedom <= 0) return false;
  const spread = Math.sqrt(2 / (9 * freedom));
  const bound = (z: number) => freedom * (1 - 2 / (9 * freedom) + z * spread) ** 3;
  return statistic >= bound(-Z_ONE_IN_A_MILLION) && statistic <= bound(Z_ONE_IN_A_MILLION);
}

function uniformCounts(counts: readonly number[]): boolean {
  return probabilityCounts(
    counts,
    counts.map(() => 1 / counts.length),
  );
}

/** Birthday probability for independent allowed words; also valid with one word fixed. */
function repeatChance(wordCount: ChosenWordCount, allowed: number): number {
  let distinct = 1;
  for (let drawn = 1; drawn < wordCount; drawn += 1) distinct *= 1 - drawn / allowed;
  return 1 - distinct;
}

function freePositions(request: ChosenWordsRequest): number[] {
  const fixed = request.chosen[0]?.position;
  // The checksum word is omitted from word and joint comparisons; its free entropy bits remain.
  return Array.from({ length: request.wordCount - 1 }, (_, index) => index + 1).filter(
    (position) => position !== fixed,
  );
}

function forbiddenIndexes(request: ChosenWordsRequest, includeAnywhere = false): number[] {
  const forbidden = request.neverUse.map((word) => WORD_INDEXES.get(word)!);
  if (includeAnywhere && request.chosen[0]?.position === "anywhere")
    forbidden.push(WORD_INDEXES.get(request.chosen[0].word)!);
  return forbidden;
}

function bitProbability(offset: number, forbidden: readonly number[]): number {
  const removed = forbidden.filter((word) => (word >> (WORD_BITS - 1 - offset)) & 1).length;
  return (WORDS / 2 - removed) / (WORDS - forbidden.length);
}

function assertWishes(drawn: Drawn, request: ChosenWordsRequest): void {
  const neverUse = forbiddenIndexes(request);
  for (const sample of drawn.samples) {
    expect(sample.words.length).toBe(request.wordCount);
    expect(
      neverUse.some((word) => sample.words.includes(word)),
      "a forbidden word appeared",
    ).toBe(false);
    for (const { word, position } of request.chosen) {
      const chosen = WORD_INDEXES.get(word)!;
      expect(
        position === "anywhere"
          ? sample.words.includes(chosen)
          : sample.words[position - 1] === chosen,
        "the chosen word did not appear where requested",
      ).toBe(true);
    }
  }
}

function assertFreeBits(drawn: Drawn, request: ChosenWordsRequest): void {
  const fixed = request.chosen[0]?.position;
  if (fixed === "anywhere") return;
  const range = fixed === undefined ? { from: 0, to: 0 } : wordBits(drawn.wordCount, fixed);
  const forbidden = forbiddenIndexes(request);
  for (let index = 0; index < entropyBits(drawn.wordCount); index += 1) {
    if (index >= range.from && index < range.to) continue;
    const ones = drawn.samples.reduce((total, sample) => total + bit(sample.entropy, index), 0);
    expect(
      frequencyWithin(ones, drawn.samples.length, bitProbability(index % WORD_BITS, forbidden)),
      `free entropy bit ${index}`,
    ).toBe(true);
  }
}

function groupedWordCounts(
  counts: readonly number[],
  forbidden: readonly number[],
  bins: number,
): boolean {
  const observed = new Array<number>(bins).fill(0);
  const allowed = new Array<number>(bins).fill(0);
  for (let word = 0; word < WORDS; word += 1) {
    if (forbidden.includes(word)) {
      if (counts[word] !== 0) return false;
      continue;
    }
    const group = Math.floor((word * bins) / WORDS);
    observed[group]! += counts[word]!;
    allowed[group]! += 1;
  }
  return probabilityCounts(
    observed,
    allowed.map((count) => count / (WORDS - forbidden.length)),
  );
}

function assertWords(
  drawn: Drawn,
  request: ChosenWordsRequest,
  bins: number,
  perPosition = true,
): void {
  const ignored =
    request.chosen[0]?.position === "anywhere"
      ? WORD_INDEXES.get(request.chosen[0].word)
      : undefined;
  const forbidden = forbiddenIndexes(request, true);
  const pooled = new Array<number>(WORDS).fill(0);
  for (const position of freePositions(request)) {
    const counts = new Array<number>(WORDS).fill(0);
    for (const sample of drawn.samples) {
      const word = sample.words[position - 1]!;
      if (word !== ignored) counts[word]! += 1;
    }
    if (perPosition)
      expect(groupedWordCounts(counts, forbidden, bins), `word position ${position}`).toBe(true);
    for (let word = 0; word < WORDS; word += 1) pooled[word]! += counts[word]!;
  }
  expect(groupedWordCounts(pooled, forbidden, bins), "pooled words").toBe(true);
}

function assertBitPair(
  drawn: Drawn,
  first: number,
  second: number,
  probabilities: readonly number[],
  ignored: number | undefined,
): void {
  const counts = [0, 0, 0, 0];
  for (const sample of drawn.samples) {
    // In the ideal independent-word model, conditioning these words to not be the anywhere
    // word leaves them independent over the remaining list. Without this filter, that null is
    // invalid. The real checksum word is excluded from these comparisons.
    if (
      ignored !== undefined &&
      (sample.words[Math.floor(first / WORD_BITS)] === ignored ||
        sample.words[Math.floor(second / WORD_BITS)] === ignored)
    )
      continue;
    const cell = 2 * bit(sample.entropy, first) + bit(sample.entropy, second);
    counts[cell]! += 1;
  }
  expect(probabilityCounts(counts, probabilities), `joint entropy bits ${first}, ${second}`).toBe(
    true,
  );
}

function assertCorrelations(drawn: Drawn, request: ChosenWordsRequest): void {
  const forbidden = forbiddenIndexes(request, true);
  const allowed = WORDS - forbidden.length;
  const ignored =
    request.chosen[0]?.position === "anywhere"
      ? WORD_INDEXES.get(request.chosen[0].word)
      : undefined;
  const positions = freePositions(request);
  for (const position of positions)
    for (let offset = 0; offset < WORD_BITS - 1; offset += 1) {
      const probabilities = Array.from({ length: 4 }, (_, cell) => {
        const removed = forbidden.filter(
          (word) => ((word >> (WORD_BITS - 2 - offset)) & 3) === cell,
        ).length;
        return (WORDS / 4 - removed) / allowed;
      });
      const first = (position - 1) * WORD_BITS + offset;
      assertBitPair(drawn, first, first + 1, probabilities, ignored);
    }
  for (let index = 1; index < positions.length; index += 1)
    for (let offset = 0; offset < WORD_BITS; offset += 1) {
      const set = bitProbability(offset, forbidden);
      assertBitPair(
        drawn,
        (positions[index - 1]! - 1) * WORD_BITS + offset,
        (positions[index]! - 1) * WORD_BITS + offset,
        [(1 - set) ** 2, (1 - set) * set, set * (1 - set), set ** 2],
        ignored,
      );
    }
}

function assertRepeats(drawn: Drawn, allowed: number): void {
  const repeated = drawn.samples.filter(({ words }) => new Set(words).size < words.length).length;
  expect(
    frequencyWithin(repeated, drawn.samples.length, repeatChance(drawn.wordCount, allowed)),
    "phrases repeating a word",
  ).toBe(true);
}

function assertAnywherePositions(drawn: Drawn, chosen: number): void {
  const counts = new Array<number>(drawn.wordCount).fill(0);
  for (const { words } of drawn.samples) {
    expect(words.includes(chosen)).toBe(true);
    if (words.filter((word) => word === chosen).length === 1) counts[words.indexOf(chosen)]! += 1;
  }
  expect(uniformCounts(counts), "anywhere singleton positions").toBe(true);
}

function assertAnywhereMultiplicity(drawn: Drawn, chosen: number, allowed: number): void {
  const probability = 1 / allowed;
  const absent = (1 - probability) ** drawn.wordCount;
  const singleton = drawn.wordCount * probability * (1 - probability) ** (drawn.wordCount - 1);
  const expected = 1 - singleton / (1 - absent);
  const repeated = drawn.samples.filter(
    ({ words }) => words.filter((word) => word === chosen).length > 1,
  ).length;
  expect(
    frequencyWithin(repeated, drawn.samples.length, expected),
    "anywhere word multiplicity",
  ).toBe(true);
}

function assertDistribution(drawn: Drawn, request: ChosenWordsRequest, bins: number): void {
  assertWishes(drawn, request);
  assertFreeBits(drawn, request);
  assertWords(drawn, request, bins);
  assertCorrelations(drawn, request);
  const allowed = WORDS - request.neverUse.length;
  if (request.chosen[0]?.position === "anywhere") {
    const chosen = WORD_INDEXES.get(request.chosen[0].word)!;
    assertAnywherePositions(drawn, chosen);
    assertAnywhereMultiplicity(drawn, chosen, allowed);
  } else assertRepeats(drawn, allowed);
}

async function draw(
  request: ChosenWordsRequest,
  samples: number,
  stream: Xorshift32,
): Promise<Drawn> {
  const drawn = new Drawn(request.wordCount);
  const randomBytes = (length: number) => stream.bytes(length);
  for (let sample = 0; sample < samples; sample += 1)
    drawn.push(await generateMnemonicWithChosenWords(request, { randomBytes }));
  return drawn;
}

function unconstrainedRequest(wordCount: ChosenWordCount): ChosenWordsRequest {
  return { wordCount, chosen: [], neverUse: [] };
}

/** An independent whole-entropy integer edit used only to construct deliberately faulty samples. */
function replaceBits(entropy: Uint8Array, start: number, width: number, value: number): void {
  const hex = Array.from(entropy, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const shift = BigInt(entropy.length * 8 - start - width);
  const mask = ((1n << BigInt(width)) - 1n) << shift;
  const changed = ((BigInt(`0x${hex}`) & ~mask) | (BigInt(value) << shift))
    .toString(16)
    .padStart(hex.length, "0");
  for (let index = 0; index < entropy.length; index += 1)
    entropy[index] = parseInt(changed.slice(index * 2, index * 2 + 2), 16);
}

function independentSamples(wordCount: ChosenWordCount, seed: number): Drawn {
  const stream = new Xorshift32(seed);
  const drawn = new Drawn(wordCount);
  for (let sample = 0; sample < SAMPLES; sample += 1)
    drawn.push(entropyToMnemonic(stream.bytes(entropyBits(wordCount) / 8), wordlist));
  return drawn;
}

function statisticalRequests(wordCount: ChosenWordCount): readonly ChosenWordsRequest[] {
  return [
    {
      wordCount,
      chosen: [{ word: "happy", position: Math.floor(wordCount / 2) }],
      neverUse: ["zoo"],
    },
    { wordCount, chosen: [{ word: "zoo", position: wordCount }], neverUse: [] },
    {
      wordCount,
      chosen: [{ word: "happy", position: "anywhere" }],
      neverUse: wordCount === PHRASE_WORDS ? [] : ["zoo"],
    },
  ];
}

/** Faulty uniform-position insertion, not rejection conditioned on an anywhere word. */
function randomPositionInsertion(wordCount: ChosenWordCount): Drawn {
  const chosen = WORD_INDEXES.get("happy")!;
  const stream = new Xorshift32(STREAM_SEED ^ (wordCount << 16));
  const drawn = new Drawn(wordCount);
  const checksum = wordCount / 3;
  const limit = 30 * 2 ** checksum;
  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const positionBytes = stream.bytes(Uint32Array.BYTES_PER_ELEMENT);
    const position = (new DataView(positionBytes.buffer).getUint32(0) % wordCount) + 1;
    const { from, to } = wordBits(wordCount, position);
    let found = false;
    for (let attempt = 0; attempt < limit; attempt += 1) {
      const entropy = stream.bytes(entropyBits(wordCount) / 8);
      replaceBits(entropy, from, to - from, position === wordCount ? chosen >> checksum : chosen);
      if (
        position === wordCount &&
        sha256(entropy)[0]! >> (8 - checksum) !== (chosen & (2 ** checksum - 1))
      )
        continue;
      drawn.push(entropyToMnemonic(entropy, wordlist));
      found = true;
      break;
    }
    expect(found, "the insertion fixture exhausted its attempt bound").toBe(true);
  }
  return drawn;
}

describe("chosen-word generator randomness", () => {
  it("sets only the chosen word's own bits, at every position", async () => {
    const stream = new Xorshift32();
    for (let sample = 0; sample < 4; sample += 1)
      for (let position = 1; position <= PHRASE_WORDS; position += 1)
        for (const number of [0, 1, 1024, 2046, 2047]) {
          // Copies of every draw, which the generator wipes once it is done.
          const draws: Uint8Array[] = [];
          const source = (length: number) => {
            const bytes = stream.bytes(length);
            const size = entropyBits(PHRASE_WORDS) / 8;
            for (let start = 0; start < length; start += size)
              draws.push(bytes.slice(start, start + size));
            return bytes;
          };
          const request: ChosenWordsRequest = {
            wordCount: PHRASE_WORDS,
            chosen: [{ word: wordlist[number]!, position }],
            neverUse: [],
          };
          const entropy = entropyOf(
            await generateMnemonicWithChosenWords(request, { randomBytes: source }),
          );
          const { from, to } = wordBits(PHRASE_WORDS, position);
          // The draw it came from differs from it only in the word's bits: the first draw for a
          // position before the last, and one that waited for the checksum for the last.
          const differsOnlyThere = (draw: Uint8Array) =>
            draw.every((byte, index) => {
              let difference = byte ^ entropy[index]!;
              for (let offset = 0; offset < 8; offset += 1) {
                const at = index * 8 + offset;
                if (at >= from && at < to) difference &= ~(1 << (7 - offset));
              }
              return difference === 0;
            });
          const origin = draws.findIndex(differsOnlyThere);
          expect(origin, `position ${position}, word ${number}`).toBeGreaterThanOrEqual(0);
          if (position < PHRASE_WORDS) expect(origin).toBe(0);
          let value = 0;
          for (let at = from; at < to; at += 1) value = (value << 1) | bit(entropy, at);
          expect(value).toBe(position < PHRASE_WORDS ? number : number >> (PHRASE_WORDS / 3));
        }
  });

  it("keeps the full 24-word statistical datasets", { timeout: 120_000 }, async () => {
    const stream = new Xorshift32();
    for (const request of statisticalRequests(PHRASE_WORDS))
      assertDistribution(await draw(request, SAMPLES, stream), request, WORDS);
  });

  for (const wordCount of WORD_COUNTS.filter((count) => count !== PHRASE_WORDS))
    it(`${wordCount}-word conditioned marginals and joints`, { timeout: 120_000 }, async () => {
      const requests = statisticalRequests(wordCount);
      for (const [mode, request] of requests.entries()) {
        const samples = wordCount === 12 && mode !== 1 ? SAMPLES : SMALL_SAMPLES;
        const bins = samples === SAMPLES ? WORDS : GROUPED_BINS;
        const stream = new Xorshift32(STREAM_SEED ^ (wordCount << 8) ^ (mode + 1));
        assertDistribution(await draw(request, samples, stream), request, bins);
      }
    });

  for (const wordCount of [12, 24] as const) {
    it(`${wordCount}-word exclusion without a chosen word`, { timeout: 120_000 }, async () => {
      const request: ChosenWordsRequest = { wordCount, chosen: [], neverUse: ["zoo"] };
      const stream = new Xorshift32(STREAM_SEED ^ wordCount);
      assertDistribution(await draw(request, SMALL_SAMPLES, stream), request, GROUPED_BINS);
    });

    it(
      `${wordCount}-word controls reject checksum-valid weak samples`,
      { timeout: 120_000 },
      () => {
        const request = unconstrainedRequest(wordCount);
        const drawn = independentSamples(wordCount, STREAM_SEED ^ (wordCount << 8));
        assertDistribution(drawn, request, WORDS);

        const clobbered = drawn.changed((entropy) => (entropy[0]! &= 0x7f));
        expect(() => assertFreeBits(clobbered, request)).toThrow();
        const repeated = drawn.changed((entropy) => entropy.set(drawn.samples[0]!.entropy));
        expect(() => assertRepeats(repeated, WORDS)).toThrow();
        let counter = 1;
        const patterned = drawn.changed((entropy) => {
          entropy.fill(0);
          new DataView(
            entropy.buffer,
            entropy.byteOffset + entropy.length - Uint32Array.BYTES_PER_ELEMENT,
          ).setUint32(0, counter++);
        });
        expect(() => assertFreeBits(patterned, request)).toThrow();

        const middle = wordCount / 2;
        const wished: ChosenWordsRequest = {
          wordCount,
          chosen: [{ word: "happy", position: middle }],
          neverUse: ["zoo"],
        };
        const forbidden = drawn.changed((entropy) => {
          replaceBits(entropy, (middle - 1) * WORD_BITS, WORD_BITS, WORD_INDEXES.get("happy")!);
          replaceBits(entropy, 0, WORD_BITS, WORD_INDEXES.get("zoo")!);
        });
        for (const { words } of forbidden.samples)
          expect(words[middle - 1]).toBe(WORD_INDEXES.get("happy"));
        expect(() => assertWishes(forbidden, wished)).toThrow(/a forbidden word appeared/u);

        // A copied bit has balanced marginals and near-normal repeats, but the joint is correlated.
        const correlated = drawn.changed((entropy) =>
          replaceBits(entropy, WORD_BITS, 1, bit(entropy, 0)),
        );
        assertFreeBits(correlated, request);
        assertWords(correlated, request, WORDS);
        assertRepeats(correlated, WORDS);
        expect(() => assertCorrelations(correlated, request)).toThrow();

        // Opposite 11-bit parity constraints cancel in the pool and preserve all bit marginals.
        const biased = drawn.changed((entropy) => {
          for (const position of [0, 1]) {
            const start = position * WORD_BITS;
            let parity = 0;
            for (let offset = 0; offset < WORD_BITS; offset += 1)
              parity ^= bit(entropy, start + offset);
            const last = start + WORD_BITS - 1;
            replaceBits(entropy, last, 1, bit(entropy, last) ^ parity ^ position);
          }
        });
        assertFreeBits(biased, request);
        assertWords(biased, request, WORDS, false);
        expect(() => assertWords(biased, request, WORDS)).toThrow();

        const chosen = WORD_INDEXES.get("happy")!;
        const anywhere: ChosenWordsRequest = {
          wordCount,
          chosen: [{ word: "happy", position: "anywhere" }],
          neverUse: [],
        };
        const forced = drawn.changed((entropy) => replaceBits(entropy, 0, WORD_BITS, chosen));
        assertWishes(forced, anywhere);
        expect(() => assertAnywherePositions(forced, chosen)).toThrow();

        const inserted = randomPositionInsertion(wordCount);
        assertWishes(inserted, anywhere);
        assertAnywherePositions(inserted, chosen);
        assertWords(inserted, anywhere, WORDS);
        expect(() => assertAnywhereMultiplicity(inserted, chosen, WORDS)).toThrow();
      },
    );
  }

  it("has checks that fail on a generator that hides its weakness", () => {
    // No repeated word at all, as a generator that suppressed repeats would give.
    expect(frequencyWithin(0, SAMPLES, repeatChance(PHRASE_WORDS, WORDS))).toBe(false);
    // A flat histogram and strongly uneven halves violate this regression model.
    expect(uniformCounts(new Array<number>(WORDS).fill(215))).toBe(false);
    expect(
      uniformCounts(Array.from({ length: WORDS }, (_, index) => (index % 2 ? 300 : 130))),
    ).toBe(false);
    // A bit set in 52 % of the phrases, 5.7 standard deviations away.
    expect(frequencyWithin(10_400, SAMPLES, 0.5)).toBe(false);
  });
});
