// AUD-026 functional: phrases drawn by the production chosen-word generator
// (generateMnemonicWithChosenWords) from a repeatable SHA-256 counter stream, for every length and
// every kind of wish, dumped for functional-chosen-words-properties.py. That script checks each
// phrase with its own BIP39 code (checksum, chosen word and position, never-use word) and the
// spread of an "anywhere" word over the positions. Output:
// docs/audits/AUD-026-evidence/functional/chosen-words.json (local evidence only).
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import {
  chosenWordsRemainingBits,
  generateMnemonicWithChosenWords,
  type ChosenWordsRequest,
} from "@ckd/core/bip39-chosen-words.js";

const OUT = new URL("../AUD-026-evidence/functional/", import.meta.url);
const SAMPLES = 300;

/** A repeatable byte stream: SHA-256 of a label and a counter. Test randomness only. */
function stream(label: string): (length: number) => Uint8Array {
  let counter = 0;
  let pool = new Uint8Array(0);
  return (length) => {
    const out = new Uint8Array(length);
    for (let at = 0; at < length; at += 1) {
      if (pool.length === 0) pool = createHash("sha256").update(`${label}:${counter++}`).digest();
      out[at] = pool[0]!;
      pool = pool.subarray(1);
    }
    return out;
  };
}

it("dumps generated phrases", async () => {
  const cases: { request: ChosenWordsRequest; bits: number; phrases: string[] }[] = [];
  for (const wordCount of [12, 15, 18, 21, 24] as const) {
    const requests: ChosenWordsRequest[] = [
      { wordCount, chosen: [{ word: "zoo", position: 1 }], neverUse: [] },
      { wordCount, chosen: [{ word: "zoo", position: wordCount }], neverUse: ["abandon"] },
      { wordCount, chosen: [{ word: "acid", position: Math.ceil(wordCount / 2) }], neverUse: [] },
      { wordCount, chosen: [{ word: "host", position: "anywhere" }], neverUse: ["zoo"] },
      { wordCount, chosen: [], neverUse: ["abandon"] },
    ];
    for (const request of requests) {
      const random = stream(JSON.stringify(request));
      const phrases: string[] = [];
      for (let sample = 0; sample < SAMPLES; sample += 1)
        phrases.push(await generateMnemonicWithChosenWords(request, { randomBytes: random }));
      cases.push({ request, bits: chosenWordsRemainingBits(request), phrases });
    }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL("chosen-words.json", OUT), JSON.stringify(cases));
});
