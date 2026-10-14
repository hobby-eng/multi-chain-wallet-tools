// The self-test of the search for forgotten words (core/candidates.ts, docs/CANDIDATES.md): the
// candidates of several marked places, a prefix with * and words joined by |, in their fixed order
// and with their entropy; the searches that are refused; a word missing at an unknown place; and,
// with the host's master fingerprint, the wallet check of a search. core/self-test.ts runs the
// quick part before every command of the command line and all of it in the full self-test.
//
// From the host it needs, for the full check only, the master fingerprint of a phrase. It holds
// public test data, no secret.
//
// Host-neutral: it imports only other core modules.

import { wipeAll } from "./bits.js";
import { WordCandidateSearch, type WordSearch } from "./candidates.js";
import { expectRefused, expectSame, hexOfBytes } from "./self-test-check.js";
import { fingerprintWalletCheck, type PhraseFingerprint } from "./wallet-check.js";

/** The master fingerprint of the public phrase (vectors/mnemocode-v1.json, direct-12). */
const PUBLIC_FINGERPRINT = "73c5da0a";
const ABANDON_ELEVEN = Array<string>(11).fill("abandon").join(" ");

/** One search and what it finds: candidate N is the same in every host (docs/CANDIDATES.md). */
interface SearchCase {
  readonly text: string;
  readonly kind: WordSearch["kind"];
  readonly combinations: number;
  readonly count: number;
  /** Candidates by their number, counted from 1: the phrase, and for some the entropy. */
  readonly candidates: readonly (readonly [number, string, string?])[];
}

/**
 * The searches of vectors/candidates-v1.json, whose candidates were counted and ordered again
 * independently with Python's hashlib from the order of docs/CANDIDATES.md; the entropy is BIP39's.
 */
const PREFIX_AND_CHOICE: SearchCase = {
  text: "abandon ab* abandon abandon abandon abandon abandon abandon abandon abandon abandon zoo|zone|about|abandon",
  kind: "unknown-words",
  combinations: 40,
  count: 3,
  candidates: [
    [1, `${ABANDON_ELEVEN} about`, "00000000000000000000000000000000"],
    [
      2,
      "abandon ability abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      "00000400000000000000000000000000",
    ],
    [
      3,
      "abandon above abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      "00001000000000000000000000000000",
    ],
  ],
};
const WORD_IN_THE_MIDDLE: SearchCase = {
  text: "legal winner thank year ? sausage worth useful legal winner thank yellow",
  kind: "unknown-words",
  combinations: 2_048,
  count: 130,
  candidates: [
    [1, "legal winner thank year act sausage worth useful legal winner thank yellow"],
    [2, "legal winner thank year actor sausage worth useful legal winner thank yellow"],
    [130, "legal winner thank year winter sausage worth useful legal winner thank yellow"],
  ],
};
const MISSING_AMONG_REPEATED: SearchCase = {
  text: `${Array<string>(10).fill("abandon").join(" ")} about`,
  kind: "missing-word",
  combinations: 24_576,
  count: 1_497,
  candidates: [
    [1, `${ABANDON_ELEVEN} about`],
    [2, `abstract ${Array<string>(10).fill("abandon").join(" ")} about`],
    [1_497, `${Array<string>(10).fill("abandon").join(" ")} about zoo`],
  ],
};
/** BIP39's vector of entropy 8080…80 in 24 words, with its 10th word left out. */
const LETTER = "letter advice cage absurd amount doctor acoustic avoid";
const AFTER_GAP = "letter cage absurd amount doctor acoustic avoid";
const LETTER_SHORT = "letter advice cage absurd amount doctor acoustic";
const MISSING_OF_24: SearchCase = {
  text: `${LETTER} ${AFTER_GAP} ${LETTER_SHORT} bless`,
  kind: "missing-word",
  combinations: 49_152,
  count: 186,
  candidates: [
    [1, `base ${LETTER} ${AFTER_GAP} ${LETTER_SHORT} bless`],
    [2, `dream ${LETTER} ${AFTER_GAP} ${LETTER_SHORT} bless`],
    [186, `${LETTER} ${AFTER_GAP} ${LETTER_SHORT} bless unable`],
  ],
};

/** Searches that are refused, and why. */
const REFUSED_SEARCHES: readonly (readonly [string, RegExp])[] = [
  [`${ABANDON_ELEVEN} zzz`, /Unknown English BIP39 word at place 12/u],
  [`${ABANDON_ELEVEN} about`, /Mark each forgotten word/u],
  [`xyz* ${Array<string>(10).fill("abandon").join(" ")} ?`, /No BIP39 word starts/u],
  // 2^33 combinations, beyond the 2^24 of one search.
  [`? ? ? ${Array<string>(9).fill("abandon").join(" ")}`, /more than 16,777,216 combinations/u],
];

/** The combinations, the candidate count and the numbered candidates of `search`. */
function checkSearch(search: SearchCase): void {
  const parsed = WordCandidateSearch.parse(search.text, search.kind);
  expectSame(parsed.combinations, search.combinations, "Word search combinations");
  const wanted = new Map(search.candidates.map((candidate) => [candidate[0], candidate]));
  let count = 0;
  for (const candidate of parsed.candidates()) {
    count += 1;
    const expected = wanted.get(candidate.number);
    if (expected === undefined) continue;
    expectSame(candidate.phrase, expected[1], `Word search candidate ${candidate.number}`);
    if (expected[2] !== undefined) {
      const entropy = candidate.entropy();
      expectSame(hexOfBytes(entropy), expected[2], `Word search entropy ${candidate.number}`);
      entropy.fill(0);
    }
  }
  expectSame(count, search.count, "Word search candidate count");
}

/** The quick known answers: two searches of marked places, and the searches refused. */
export function checkWordSearchStartup(): void {
  checkSearch(PREFIX_AND_CHOICE);
  checkSearch(WORD_IN_THE_MIDDLE);
  for (const [text, because] of REFUSED_SEARCHES)
    expectRefused(
      () => WordCandidateSearch.parse(text, "unknown-words"),
      because,
      "A refused word search",
    );
}

/**
 * Every check: the quick ones, the two searches of a word missing at an unknown place, and a
 * search run with the wallet check of the host's master fingerprint, which matches only the public
 * phrase and keeps the entropy of every candidate for a list.
 */
export async function checkWordSearch(fingerprint: PhraseFingerprint): Promise<void> {
  checkWordSearchStartup();
  checkSearch(MISSING_AMONG_REPEATED);
  checkSearch(MISSING_OF_24);
  const result = await WordCandidateSearch.parse(PREFIX_AND_CHOICE.text, "unknown-words").run({
    walletCheck: fingerprintWalletCheck(fingerprint, PUBLIC_FINGERPRINT),
    keep: PREFIX_AND_CHOICE.count,
  });
  try {
    expectSame(result.count, PREFIX_AND_CHOICE.count, "Word search run count");
    expectSame(result.matched, 1, "Word search wallet matches");
    expectSame(result.shown[0]?.match?.matched, true, "Word search match of the public phrase");
    expectSame(
      result.entropies.map(hexOfBytes).join(" "),
      PREFIX_AND_CHOICE.candidates.map((candidate) => candidate[2]).join(" "),
      "Word search entropies for a list",
    );
  } finally {
    wipeAll(result.entropies);
  }
}
