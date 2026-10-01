// AUD-019 probes of "Generate with chosen words" (packages/crypto-core/src/bip39-chosen-words.ts)
// through its production entry point. The repository's own tests check validity, the bit
// placement and an independent reading of the rules draw by draw; these probes add what they do
// not: the output distribution, and what the injectable random source is allowed to return.
//
// Public data only: every phrase here comes from a repeatable SHA-256 counter stream and is
// discarded. The stream is never a source for a real phrase.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { describe, expect, it } from "vitest";
import {
  generateMnemonicWithChosenWords,
  type ChosenWordsRequest,
} from "../../../packages/crypto-core/src/bip39-chosen-words.ts";

/** SHA-256 of a label and a counter: a repeatable stream that differs for every label. */
function counterStream(label: string) {
  let counter = 0;
  return (length: number): Uint8Array => {
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 32) {
      const block = createHash("sha256").update(`${label}:${counter}`).digest();
      counter += 1;
      bytes.set(block.subarray(0, Math.min(32, length - offset)), offset);
    }
    return bytes;
  };
}

/** Pearson's chi-square statistic of observed counts against equal expected counts. */
function chiSquare(counts: readonly number[]): number {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
}

const EVIDENCE_DIR = process.env.AUDIT_EVIDENCE_DIR ?? "docs/audits/AUD-019-evidence";
const results: Record<string, unknown> = {};

/** Keeps a probe's numbers in the local evidence folder; vitest hides output of passing tests. */
function record(name: string, value: unknown): void {
  results[name] = value;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const label = process.env.AUDIT_LABEL ?? "run";
  writeFileSync(
    `${EVIDENCE_DIR}/chosen-words-probe-${label}.json`,
    `${JSON.stringify(results, null, 2)}\n`,
  );
}

/**
 * Upper 0.1 % points of the chi-square distribution (standard tables): a uniform generator
 * exceeds them in one run of a thousand.
 */
const CHI_SQUARE_0_001 = { 3: 16.266, 11: 31.264 } as const;

describe("AUD-019 chosen words: output distribution", () => {
  it("places an 'anywhere' word at every position of a 12-word phrase equally often", async () => {
    const request: ChosenWordsRequest = {
      wordCount: 12,
      chosen: [{ word: "zoo", position: "anywhere" }],
      neverUse: [],
    };
    const randomBytes = counterStream("anywhere-position");
    const counts = Array.from({ length: 12 }, () => 0);
    const PHRASES = 6_000;
    for (let index = 0; index < PHRASES; index += 1) {
      const phrase = await generateMnemonicWithChosenWords(request, { randomBytes });
      const words = phrase.split(" ");
      expect(validateMnemonic(phrase, wordlist)).toBe(true);
      // A phrase can hold the word twice; every occurrence counts.
      words.forEach((word, position) => {
        if (word === "zoo") counts[position]! += 1;
      });
    }
    const statistic = chiSquare(counts);
    record("anywherePosition", { phrases: PHRASES, counts, chiSquare: statistic });
    expect(statistic).toBeLessThan(CHI_SQUARE_0_001[11]);
  });

  it("leaves the free words uniform when the last word is fixed", async () => {
    // The last word carries the checksum; a fixed last word must not tilt the other words. The top
    // two bits of the first word fall into four classes of equal size.
    const request: ChosenWordsRequest = {
      wordCount: 12,
      chosen: [{ word: "zoo", position: 12 }],
      neverUse: [],
    };
    const randomBytes = counterStream("fixed-last");
    const counts = [0, 0, 0, 0];
    const PHRASES = 4_000;
    for (let index = 0; index < PHRASES; index += 1) {
      const phrase = await generateMnemonicWithChosenWords(request, { randomBytes });
      const words = phrase.split(" ");
      expect(words[11]).toBe("zoo");
      expect(validateMnemonic(phrase, wordlist)).toBe(true);
      counts[wordlist.indexOf(words[0]!) >> 9]! += 1;
    }
    const statistic = chiSquare(counts);
    record("fixedLastFirstWordClasses", { phrases: PHRASES, counts, chiSquare: statistic });
    expect(statistic).toBeLessThan(CHI_SQUARE_0_001[3]);
  });
});

describe("AUD-019 chosen words: injected random source", () => {
  it("refuses a source that returns too few bytes instead of returning an invalid phrase", async () => {
    // One byte short: the last draw of every batch of 256 then has 15 entropy bytes. With an
    // "anywhere" wish most draws are rejected, so some phrases come from such a short draw.
    const stream = counterStream("short");
    const short = (length: number) => stream(length).subarray(0, length - 1);
    const anywhere: ChosenWordsRequest = {
      wordCount: 12,
      chosen: [{ word: "zoo", position: "anywhere" }],
      neverUse: [],
    };
    const PHRASES = 2_000;
    let invalid = 0;
    let refused = 0;
    for (let index = 0; index < PHRASES; index += 1) {
      try {
        const phrase = await generateMnemonicWithChosenWords(anywhere, { randomBytes: short });
        if (!validateMnemonic(phrase, wordlist)) invalid += 1;
      } catch {
        refused += 1;
      }
    }
    record("shortSource", { phrases: PHRASES, invalidChecksum: invalid, refused });
    // The contract of a random source is "exactly `length` bytes"; anything else must be refused
    // rather than turned into a phrase.
    expect(invalid).toBe(0);
    expect(refused).toBe(PHRASES);
  });

  it("records what a source that returns a non-Uint8Array produces", async () => {
    const wrongType = (length: number) => Array.from({ length }, () => 7) as unknown as Uint8Array;
    const request: ChosenWordsRequest = { wordCount: 12, chosen: [], neverUse: ["abandon"] };
    const outcome = await generateMnemonicWithChosenWords(request, {
      randomBytes: wrongType,
    }).then(
      (phrase) => ({ phrase }),
      (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
    );
    record("wrongTypeSource", outcome);
    expect(outcome).toHaveProperty("error");
  });
});
