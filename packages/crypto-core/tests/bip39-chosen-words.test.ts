import { entropyToMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chosenWordsRemainingBits,
  chosenWordsSelfTestPhrase,
  generateMnemonicWithChosenWords,
  type ChosenWordCount,
  type ChosenWordsRequest,
} from "../src/bip39-chosen-words.js";
import { hasUnknownWords } from "../../../apps/key-derivation/src/ui/chosen-words-feature.js";

const WORD_COUNTS: readonly ChosenWordCount[] = [12, 15, 18, 21, 24];
/** Entropy bits of each length: 11 per word minus one checksum bit for every three words. */
const ENTROPY_BITS = { 12: 128, 15: 160, 18: 192, 21: 224, 24: 256 } as const;
/** Draws the generator takes from one call of its random source (DRAWS_PER_BATCH). */
const DRAWS_PER_BATCH = 256;

function meetsWishes(phrase: string, request: ChosenWordsRequest): boolean {
  const words = phrase.split(" ");
  if (words.length !== request.wordCount || !validateMnemonic(phrase, wordlist)) return false;
  if (request.neverUse.some((word) => words.includes(word))) return false;
  return request.chosen.every(({ word, position }) =>
    position === "anywhere" ? words.includes(word) : words[position - 1] === word,
  );
}

/** A repeatable byte stream for tests: SHA-256 of a seed and a counter. Never used for a real phrase. */
function seededSource(seed: number) {
  let counter = 0;
  const handedOut: Uint8Array[] = [];
  const source = (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 32) {
      const block = sha256(
        new Uint8Array([
          seed,
          counter >>> 24,
          (counter >>> 16) & 255,
          (counter >>> 8) & 255,
          counter & 255,
        ]),
      );
      counter += 1;
      bytes.set(block.subarray(0, Math.min(32, length - offset)), offset);
    }
    handedOut.push(bytes);
    return bytes;
  };
  return { source, handedOut };
}

/**
 * An independent, slow reading of the rules: the draws of the same byte stream in order, each
 * changed with bit strings and finished by @scure/bip39, which calculates the checksum. Returns
 * the first phrase that meets the wishes and its draw number.
 */
function referenceSearch(request: ChosenWordsRequest, bytes: Uint8Array[], limit: number) {
  const entropyBytes = ENTROPY_BITS[request.wordCount] / 8;
  const checksumBits = request.wordCount / 3;
  for (let draw = 0; draw < limit; draw += 1) {
    const batch = bytes[Math.floor(draw / DRAWS_PER_BATCH)]!;
    const start = (draw % DRAWS_PER_BATCH) * entropyBytes;
    let bits = [...batch.subarray(start, start + entropyBytes)]
      .map((byte) => byte.toString(2).padStart(8, "0"))
      .join("");
    for (const { word, position } of request.chosen) {
      if (position === "anywhere") continue;
      const index = wordlist.indexOf(word).toString(2).padStart(11, "0");
      const from = (position - 1) * 11;
      const width = position === request.wordCount ? 11 - checksumBits : 11;
      bits = bits.slice(0, from) + index.slice(0, width) + bits.slice(from + width);
    }
    const entropy = Uint8Array.from(bits.match(/.{8}/gu)!.map((byte) => parseInt(byte, 2)));
    const phrase = entropyToMnemonic(entropy, wordlist);
    if (meetsWishes(phrase, request)) return { phrase, draw };
  }
  return null;
}

describe("BIP39 phrase with chosen words", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("meets every kind of wish with a valid checksum, at every length", async () => {
    for (const wordCount of WORD_COUNTS) {
      const requests: ChosenWordsRequest[] = [
        { wordCount, chosen: [], neverUse: [] },
        { wordCount, chosen: [{ word: "happy", position: 1 }], neverUse: [] },
        { wordCount, chosen: [{ word: "happy", position: wordCount }], neverUse: [] },
        {
          wordCount,
          chosen: [{ word: "river", position: "anywhere" }],
          neverUse: ["zoo", "abandon"],
        },
        {
          wordCount,
          chosen: [
            { word: "happy", position: 2 },
            { word: "zebra", position: wordCount },
          ],
          neverUse: [],
        },
        {
          wordCount,
          chosen: [
            { word: "happy", position: "anywhere" },
            { word: "river", position: "anywhere" },
          ],
          neverUse: ["zoo"],
        },
      ];
      for (const request of requests)
        for (let round = 0; round < 3; round += 1)
          expect(
            meetsWishes(await generateMnemonicWithChosenWords(request), request),
            JSON.stringify(request),
          ).toBe(true);
    }
  });

  it("gives the same phrase as an independent reading of the rules, draw by draw", async () => {
    const cases: { request: ChosenWordsRequest; atLeastDraw: number; seed?: number }[] = [
      // A fixed last word must wait for its checksum: the first draws are rejected.
      {
        request: { wordCount: 12, chosen: [{ word: "zoo", position: 12 }], neverUse: [] },
        atLeastDraw: 1,
      },
      {
        request: {
          wordCount: 24,
          chosen: [
            { word: "happy", position: 3 },
            { word: "zebra", position: 24 },
          ],
          neverUse: ["abandon"],
        },
        atLeastDraw: 1,
      },
      // With seed 13 the first phrase that contains "happy" is draw 301, in the second call of
      // the source: the search crosses a batch boundary. (Two words anywhere would too, but need
      // about 29,000 draws, which makes the slow reference reading too slow for a unit test.)
      {
        request: { wordCount: 12, chosen: [{ word: "happy", position: "anywhere" }], neverUse: [] },
        atLeastDraw: DRAWS_PER_BATCH,
        seed: 13,
      },
    ];
    for (const [index, { request, atLeastDraw, seed = index }] of cases.entries()) {
      const { source, handedOut } = seededSource(seed);
      const phrase = await generateMnemonicWithChosenWords(request, { randomBytes: source });
      // The generator wipes its batches, so the reference reads the same stream again.
      const replay = seededSource(seed);
      const expected = referenceSearch(
        request,
        Array.from(handedOut, () => replay.source(handedOut[0]!.length)),
        handedOut.length * DRAWS_PER_BATCH,
      );
      expect(expected, JSON.stringify(request)).not.toBeNull();
      expect(phrase).toBe(expected!.phrase);
      expect(expected!.draw).toBeGreaterThanOrEqual(atLeastDraw);
    }
  });

  it("finds the self-test phrase that the independent reading finds", () => {
    // The self-test's xorshift32 stream from its seed 0x2545f491, read in batches of 256 draws.
    let state = 0x2545f491;
    const stream = (length: number) =>
      Uint8Array.from({ length }, () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state & 255;
      });
    const request: ChosenWordsRequest = {
      wordCount: 12,
      chosen: [
        { word: "happy", position: 1 },
        { word: "zoo", position: 12 },
      ],
      neverUse: ["abandon"],
    };
    const batches = Array.from({ length: 4 }, () => stream(16 * DRAWS_PER_BATCH));
    const expected = referenceSearch(request, batches, batches.length * DRAWS_PER_BATCH);
    expect(chosenWordsSelfTestPhrase()).toBe(expected!.phrase);
    expect(expected!.phrase).toBe(
      "happy model cupboard shell brush radar pipe spoil market video flee zoo",
    );
  });

  it("wipes every batch of random bytes, when it finds a phrase and when it gives up", async () => {
    const found = seededSource(7);
    await generateMnemonicWithChosenWords(
      {
        wordCount: 12,
        chosen: [
          { word: "happy", position: "anywhere" },
          { word: "river", position: "anywhere" },
        ],
        neverUse: [],
      },
      { randomBytes: found.source },
    );
    expect(found.handedOut.length).toBeGreaterThan(1);
    for (const batch of found.handedOut) expect(batch.every((byte) => byte === 0)).toBe(true);

    // Every draw starts with "abandon", which is never to be used, so the search runs out after
    // thirty times the ~171 draws that one word anywhere needs: many batches.
    const handedOut: Uint8Array[] = [];
    const neverMatches = (length: number): Uint8Array => {
      const bytes = new Uint8Array(length).fill(0x5a);
      for (let start = 0; start < length; start += 16) {
        bytes[start] = 0;
        bytes[start + 1]! &= 0x1f;
      }
      handedOut.push(bytes);
      return bytes;
    };
    await expect(
      generateMnemonicWithChosenWords(
        { wordCount: 12, chosen: [{ word: "happy", position: "anywhere" }], neverUse: ["abandon"] },
        { randomBytes: neverMatches },
      ),
    ).rejects.toThrow("No phrase met these wishes in time");
    expect(handedOut.length).toBeGreaterThan(1);
    for (const batch of handedOut) expect(batch.every((byte) => byte === 0)).toBe(true);
  });

  it("stops when cancelled and wipes what it drew", async () => {
    const { source, handedOut } = seededSource(3);
    const control = new AbortController();
    control.abort();
    await expect(
      generateMnemonicWithChosenWords(
        { wordCount: 12, chosen: [{ word: "happy", position: 1 }], neverUse: [] },
        { signal: control.signal, randomBytes: source },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(handedOut).toHaveLength(0);

    // Cancelled during the search: it stops at its next pause, after 10,000 draws. Two words
    // anywhere allow far more draws than that, and all-zero bytes never contain them.
    const later = new AbortController();
    const zeros: Uint8Array[] = [];
    const neverHappy = (length: number) => {
      const bytes = new Uint8Array(length);
      zeros.push(bytes);
      return bytes;
    };
    const search = generateMnemonicWithChosenWords(
      {
        wordCount: 12,
        chosen: [
          { word: "happy", position: "anywhere" },
          { word: "river", position: "anywhere" },
        ],
        neverUse: [],
      },
      { signal: later.signal, randomBytes: neverHappy },
    );
    later.abort();
    await expect(search).rejects.toMatchObject({ name: "AbortError" });
    for (const batch of zeros) expect(batch.every((byte) => byte === 0)).toBe(true);
  });

  it("fails without Web Crypto instead of using another source", async () => {
    vi.stubGlobal("crypto", undefined);
    await expect(
      generateMnemonicWithChosenWords({
        wordCount: 12,
        chosen: [{ word: "happy", position: 1 }],
        neverUse: [],
      }),
    ).rejects.toThrow("Secure randomness is unavailable");
  });

  it("accepts words in any letter case and with spaces around them", async () => {
    const phrase = await generateMnemonicWithChosenWords({
      wordCount: 12,
      chosen: [{ word: " Happy ", position: 3 }],
      neverUse: [" ZOO"],
    });
    expect(phrase.split(" ")[2]).toBe("happy");
  });

  it("counts the random bits that remain", () => {
    for (const wordCount of WORD_COUNTS) {
      const full = ENTROPY_BITS[wordCount];
      expect(chosenWordsRemainingBits({ wordCount, chosen: [], neverUse: [] })).toBe(full);
      // A fixed word, also the last one, takes exactly 11 bits.
      for (const position of [1, wordCount])
        expect(
          chosenWordsRemainingBits({
            wordCount,
            chosen: [{ word: "happy", position }],
            neverUse: [],
          }),
        ).toBe(full - 11);
      // A word anywhere: -log2 of the chance that it is among the words, 1 - (2047/2048)^n.
      const anywhere = chosenWordsRemainingBits({
        wordCount,
        chosen: [{ word: "happy", position: "anywhere" }],
        neverUse: [],
      });
      expect(anywhere).toBeCloseTo(full + Math.log2(1 - (2047 / 2048) ** wordCount), 9);
    }
    // One never-use word in 12 positions: 12 * log2(2048 / 2047).
    expect(chosenWordsRemainingBits({ wordCount: 12, chosen: [], neverUse: ["zoo"] })).toBeCloseTo(
      128 - 12 * Math.log2(2048 / 2047),
      9,
    );
  });

  it("refuses wishes it cannot keep, without repeating a chosen word", async () => {
    const refused = async (request: ChosenWordsRequest, message: string) => {
      const error = await generateMnemonicWithChosenWords(request).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(message);
      for (const { word } of request.chosen)
        expect((error as Error).message).not.toContain(word.trim());
    };
    await refused(
      { wordCount: 12, chosen: [{ word: "hapy", position: 1 }], neverUse: [] },
      "Chosen word 1 is not an English BIP39 word",
    );
    // Two words typed into the field of one word are not one BIP39 word.
    await refused(
      { wordCount: 12, chosen: [{ word: "happy river", position: 1 }], neverUse: [] },
      "Chosen word 1 is not an English BIP39 word",
    );
    await refused({ wordCount: 12, chosen: [], neverUse: ["zooo"] }, "Never-use word 1 is not");
    await refused(
      {
        wordCount: 12,
        chosen: [
          { word: "happy", position: 1 },
          { word: "river", position: 2 },
          { word: "zebra", position: 3 },
        ],
        neverUse: [],
      },
      "at most two words",
    );
    await refused(
      {
        wordCount: 12,
        chosen: [
          { word: "happy", position: 1 },
          { word: "happy", position: 2 },
        ],
        neverUse: [],
      },
      "two different words",
    );
    await refused(
      {
        wordCount: 12,
        chosen: [
          { word: "happy", position: 4 },
          { word: "river", position: 4 },
        ],
        neverUse: [],
      },
      "position 4",
    );
    await refused(
      { wordCount: 12, chosen: [{ word: "happy", position: 13 }], neverUse: [] },
      "position from 1 to 12",
    );
    await refused(
      { wordCount: 12, chosen: [{ word: "happy", position: 1 }], neverUse: ["happy"] },
      "also in the never-use list",
    );
    // Excluding 1,099 words costs about 1.1 bits for each of the ten free positions; with two
    // fixed words that leaves fewer than 96 bits.
    await refused(
      {
        wordCount: 12,
        chosen: [
          { word: "happy", position: 1 },
          { word: "river", position: 2 },
        ],
        neverUse: wordlist.slice(0, 1100).filter((word) => word !== "happy" && word !== "river"),
      },
      "at least 96 are required",
    );
  });

  it("marks a field the way the generator reads it", () => {
    expect(hasUnknownWords("", true)).toBe(false);
    expect(hasUnknownWords(" Happy ", true)).toBe(false);
    expect(hasUnknownWords("hapy", true)).toBe(true);
    // The field of one word holds one word.
    expect(hasUnknownWords("happy river", true)).toBe(true);
    expect(hasUnknownWords("zoo abandon", false)).toBe(false);
    expect(hasUnknownWords("zoo qwerty", false)).toBe(true);
  });
});
