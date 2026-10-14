import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { describe, it } from "vitest";
import {
  CHOSEN_WORDS_KNOWN_ANSWERS,
  generateMnemonicWithChosenWords,
  type ChosenWordCount,
  type ChosenWordsRequest,
} from "../src/bip39-chosen-words.js";

// Independent BIP39 oracle: whole integers and Node's SHA-256, rather than the generator's
// per-byte masks and Noble hash. Published BIP39 geometry is intentionally pinned here.
const WORD_COUNTS: readonly ChosenWordCount[] = [12, 15, 18, 21, 24];
const WORD_BITS = 11;
const WORD_MASK = (1n << BigInt(WORD_BITS)) - 1n;
const WORD_INDEX_COUNT = 2048;
const BATCH_DRAWS = 256;
const EXHAUSTIVE_TIMEOUT_MS = 120_000;

function entropyBytes(words: ChosenWordCount): number {
  return (words / 3) * 4;
}

function integer(bytes: Uint8Array): bigint {
  return BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
}

function overwrite(before: Uint8Array, position: number, index: number): Uint8Array {
  const totalBits = before.length * 8;
  const start = (position - 1) * WORD_BITS;
  const width = Math.min(WORD_BITS, totalBits - start);
  const shift = BigInt(totalBits - start - width);
  const mask = ((1n << BigInt(width)) - 1n) << shift;
  const value = (integer(before) & ~mask) | (BigInt(index >> (WORD_BITS - width)) << shift);
  return Uint8Array.from(Buffer.from(value.toString(16).padStart(before.length * 2, "0"), "hex"));
}

function checksum(entropy: Uint8Array, words: ChosenWordCount): number {
  return createHash("sha256").update(entropy).digest()[0]! >> (8 - words / 3);
}

function oraclePhrase(entropy: Uint8Array, words: ChosenWordCount): string {
  const stream = (integer(entropy) << BigInt(words / 3)) | BigInt(checksum(entropy, words));
  return Array.from({ length: words }, (_, position) => {
    const shift = BigInt((words - position - 1) * WORD_BITS);
    return wordlist[Number((stream >> shift) & WORD_MASK)]!;
  }).join(" ");
}

function edgeEntropies(words: ChosenWordCount): Uint8Array[] {
  const length = entropyBytes(words);
  return [
    new Uint8Array(length),
    new Uint8Array(length).fill(255),
    Uint8Array.from({ length }, (_, index) => index),
    Uint8Array.from({ length }, (_, index) => 255 - index),
  ];
}

/** One owned, reusable batch avoids allocating gigabytes over the exhaustive public calls. */
class PublicDrawOracle {
  readonly #batch: Uint8Array;
  readonly #words: ChosenWordCount;

  constructor(words: ChosenWordCount) {
    this.#words = words;
    this.#batch = new Uint8Array(entropyBytes(words) * BATCH_DRAWS);
  }

  async compare(
    request: ChosenWordsRequest,
    first: Uint8Array,
    accepted: Uint8Array,
    second?: Uint8Array,
  ): Promise<void> {
    const expected = oraclePhrase(accepted, this.#words);
    let calls = 0;
    const actual = await generateMnemonicWithChosenWords(request, {
      randomBytes: (length) => {
        assert.equal(length, this.#batch.length);
        assert.equal(++calls, 1, "the supplied first or second candidate must pass");
        this.#batch.fill(0);
        this.#batch.set(first);
        if (second !== undefined) this.#batch.set(second, first.length);
        return this.#batch;
      },
    });
    assert.equal(actual, expected);
  }

  assertWiped(): void {
    assert.ok(
      this.#batch.every((byte) => byte === 0),
      "the used random batch is wiped",
    );
  }
}

function finalExamples(words: ChosenWordCount): Uint8Array[] {
  const cs = words / 3;
  const checksumValues = 2 ** cs;
  const tailValues = 2 ** (WORD_BITS - cs);
  const examples = new Array<Uint8Array>(WORD_INDEX_COUNT);
  for (let tail = 0; tail < tailValues; tail += 1) {
    let left = checksumValues;
    for (let counter = 0; left > 0 && counter < 100_000; counter += 1) {
      const before = new Uint8Array(entropyBytes(words)).fill(0xa5);
      new DataView(before.buffer).setUint32(0, counter, false);
      const candidate = overwrite(before, words, tail << cs);
      const number = (tail << cs) | checksum(candidate, words);
      if (examples[number] === undefined) {
        examples[number] = candidate;
        left -= 1;
      }
    }
    assert.equal(left, 0, "independent SHA-256 must find every final checksum value");
  }
  return examples;
}

function differentChecksum(valid: Uint8Array, words: ChosenWordCount): Uint8Array {
  const wanted = checksum(valid, words);
  for (let changed = 1; changed < 256; changed += 1) {
    const candidate = valid.slice();
    candidate[0]! ^= changed;
    if (checksum(candidate, words) !== wanted) return candidate;
  }
  throw new Error("No deliberately wrong checksum fixture was found.");
}

/** The page self-test's stream, xorshift32 from 0x2545f491, pinned here independently. */
function selfTestStream(): (length: number) => Uint8Array {
  let state = 0x2545f491;
  return (length) =>
    Uint8Array.from({ length }, () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      return state & 255;
    });
}

/** The words of draw `draw` of the self-test stream for `request`, its fixed words set. */
function oracleDraw(request: ChosenWordsRequest, draw: number): string[] {
  const bytes = entropyBytes(request.wordCount);
  const batches = Math.floor(draw / BATCH_DRAWS) + 1;
  const stream = selfTestStream();
  let entropy: Uint8Array = new Uint8Array();
  for (let batch = 0; batch < batches; batch += 1) {
    const drawn = stream(bytes * BATCH_DRAWS);
    if (batch === batches - 1) {
      const slot = draw % BATCH_DRAWS;
      entropy = drawn.slice(slot * bytes, (slot + 1) * bytes);
    }
  }
  for (const { word, position } of request.chosen)
    if (position !== "anywhere") entropy = overwrite(entropy, position, wordlist.indexOf(word));
  return oraclePhrase(entropy, request.wordCount).split(" ");
}

function meetsWishes(words: readonly string[], request: ChosenWordsRequest): boolean {
  return (
    request.chosen.every(({ word, position }) =>
      position === "anywhere" ? words.includes(word) : words[position - 1] === word,
    ) && !request.neverUse.some((word) => words.includes(word))
  );
}

/** The draw the page self-test must accept for each known answer, and why it is the first. */
const KNOWN_ANSWER_DRAWS: Readonly<Record<string, number>> = {
  "last word of all ones and a word never to use": 769,
  "first word and a word never to use": 1,
  "middle word and a first word never to use": 1,
  "word across three bytes": 0,
  "word anywhere": 2,
  "12-word last word of mixed bits": 14,
};

describe("BIP39 chosen-word boundaries (AUD-025)", () => {
  it("reproduces every startup known answer with the oracle, each through its own branch", () => {
    for (const { label, request, phrase } of CHOSEN_WORDS_KNOWN_ANSWERS) {
      const accepted = KNOWN_ANSWER_DRAWS[label];
      assert.notEqual(accepted, undefined, label);
      for (let draw = 0; draw < accepted!; draw += 1)
        assert.equal(meetsWishes(oracleDraw(request, draw), request), false, `${label} ${draw}`);
      const words = oracleDraw(request, accepted!);
      assert.equal(meetsWishes(words, request), true, label);
      assert.equal(words.join(" "), phrase, label);
    }
    const [, first, middle, across, anywhere, mixed] = CHOSEN_WORDS_KNOWN_ANSWERS;
    // The first draws are refused for the reason each case is there for.
    assert.equal(oracleDraw(first!.request, 0)[1], "frost");
    assert.equal(oracleDraw(middle!.request, 0)[0], "deny");
    for (const draw of [0, 1]) assert.ok(!oracleDraw(anywhere!.request, draw).includes("host"));
    // The word across three bytes starts at bit 22 of bits 22 to 32.
    assert.equal((((across!.request.chosen[0]!.position as number) - 1) * WORD_BITS) % 8, 6);
    // The 12-word last word carries both bit values in its entropy and in its checksum bits.
    const last = wordlist.indexOf(mixed!.request.chosen[0]!.word);
    assert.deepEqual([last >> 4, last & 15], [0b1010101, 0b0101]);
  });

  it("validates the independent oracle against published and dependency BIP39 answers", () => {
    // Published Trezor BIP39 vectors: zero128 -> eleven abandon + about; zero256 ->
    // twenty-three abandon + art; ff256 -> twenty-three zoo + vote.
    assert.equal(oraclePhrase(new Uint8Array(16), 12), `${"abandon ".repeat(11)}about`);
    assert.equal(oraclePhrase(new Uint8Array(32), 24), `${"abandon ".repeat(23)}art`);
    assert.equal(oraclePhrase(new Uint8Array(32).fill(255), 24), `${"zoo ".repeat(23)}vote`);
    for (const words of WORD_COUNTS)
      for (const entropy of edgeEntropies(words))
        assert.equal(oraclePhrase(entropy, words), entropyToMnemonic(entropy, wordlist));
  });

  for (const words of WORD_COUNTS) {
    it(
      `preserves every neighboring bit for all nonfinal indices at ${words} words`,
      { timeout: EXHAUSTIVE_TIMEOUT_MS },
      async () => {
        const oracle = new PublicDrawOracle(words);
        const edges = edgeEntropies(words);
        for (let position = 1; position < words; position += 1) {
          for (let number = 0; number < WORD_INDEX_COUNT; number += 1) {
            const request: ChosenWordsRequest = {
              wordCount: words,
              chosen: [{ word: wordlist[number]!, position }],
              neverUse: [],
            };
            for (const before of edges)
              await oracle.compare(request, before, overwrite(before, position, number));
          }
          oracle.assertWiped();
        }
      },
    );

    it(
      `keeps the ${WORD_BITS - words / 3}+${words / 3} final split and refuses wrong checksums`,
      { timeout: EXHAUSTIVE_TIMEOUT_MS },
      async () => {
        const oracle = new PublicDrawOracle(words);
        const examples = finalExamples(words);
        const cs = words / 3;
        const tailMask = 2 ** (WORD_BITS - cs) - 1;
        for (let number = 0; number < WORD_INDEX_COUNT; number += 1) {
          const valid = examples[number]!;
          const request: ChosenWordsRequest = {
            wordCount: words,
            chosen: [{ word: wordlist[number]!, position: words }],
            neverUse: [],
          };
          assert.equal(oraclePhrase(valid, words).split(" ").at(-1), wordlist[number]);
          const before = overwrite(valid, words, ((number >> cs) ^ tailMask) << cs);
          await oracle.compare(request, before, valid);
          // A final-word checksum miss must skip this first candidate, not set/checksum-repair it.
          await oracle.compare(request, differentChecksum(valid, words), valid, valid);
        }
        // Every raw entropy suffix has one identical output for these representative final words.
        for (const number of [0, 1, 1024, 2047]) {
          const valid = examples[number]!;
          for (let tail = 0; tail <= tailMask; tail += 1)
            await oracle.compare(
              {
                wordCount: words,
                chosen: [{ word: wordlist[number]!, position: words }],
                neverUse: [],
              },
              overwrite(valid, words, tail << cs),
              valid,
            );
        }
        oracle.assertWiped();
      },
    );

    it(`filters excluded/anywhere words without changing eligible candidates at ${words} words`, async () => {
      const oracle = new PublicDrawOracle(words);
      const zero = new Uint8Array(entropyBytes(words));
      const ones = new Uint8Array(entropyBytes(words)).fill(255);
      const zeroLast = oraclePhrase(zero, words).split(" ").at(-1)!;
      await oracle.compare(
        { wordCount: words, chosen: [], neverUse: ["abandon"] },
        zero,
        ones,
        ones,
      );
      await oracle.compare(
        { wordCount: words, chosen: [], neverUse: [zeroLast] },
        zero,
        ones,
        ones,
      );
      await oracle.compare(
        { wordCount: words, chosen: [{ word: "zoo", position: "anywhere" }], neverUse: [] },
        zero,
        ones,
        ones,
      );
      for (const repeated of [1, 2, 3]) {
        let before: Uint8Array = new Uint8Array(entropyBytes(words)).fill(0x5a);
        for (let position = 1; position <= repeated; position += 1)
          before = overwrite(before, position, 2047);
        await oracle.compare(
          { wordCount: words, chosen: [{ word: "zoo", position: "anywhere" }], neverUse: [] },
          before,
          before,
        );
      }
      oracle.assertWiped();
    });

    it(`refuses malformed positions before asking for entropy at ${words} words`, async () => {
      for (const position of [0, -1, words + 1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        let calls = 0;
        await assert.rejects(
          generateMnemonicWithChosenWords(
            { wordCount: words, chosen: [{ word: "happy", position }], neverUse: [] },
            {
              randomBytes: () => {
                calls += 1;
                return new Uint8Array();
              },
            },
          ),
          /needs a position/u,
        );
        assert.equal(calls, 0);
      }
    });
  }
});
