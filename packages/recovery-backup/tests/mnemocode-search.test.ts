import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { describe, expect, it } from "vitest";
import {
  createSessionIdentity,
  decryptCandidates,
} from "../../recovery-mnemocode/source/core/candidate-encryption.js";
import { decodeCandidateList } from "../../recovery-mnemocode/source/core/candidate-list.js";
import {
  CandidateListWriter,
  MnemoCodeSearches,
  MnemoCodeSearchSettings,
  type ListProtectionRequest,
  type SearchOutcome,
  type SearchProgress,
  type SearchQuestion,
} from "../src/mnemocode-search.js";

/** The outcome of a date search that ran: ten dates are far below the time that asks first. */
function ran(outcome: SearchOutcome | SearchQuestion): SearchOutcome {
  if ("question" in outcome) throw new Error(`Unexpected question: ${outcome.question}`);
  return outcome;
}

const noProgress = (): void => undefined;
const signal = new AbortController().signal;
/** A public master fingerprint that no candidate here has; the stubs below decide the match. */
const wallet = {
  evidence: { kind: "master-fingerprint" as const, value: "00000000", network: "mainnet" as const },
  passphrase: "",
};
const NO_LIST: ListProtectionRequest = { kind: "none" };
const SYNTHETIC_LIST_PASSPHRASE: ListProtectionRequest = {
  kind: "passphrase",
  passphrase: "synthetic list passphrase",
};
/** BIP39 all-zero entropy is abandon eleven times, then about (index 3). */
const ZERO_ENTROPY = new Uint8Array(16);
/** Neither abandon (0) nor ability (1) completes the checksum of all-zero entropy. */
const NO_VALID_WORDS = `${"abandon ".repeat(11)}abandon|ability`;
/** Of about and zoo, only about completes it: one candidate. */
const ONE_VALID_WORD = `${"abandon ".repeat(11)}about|zoo`;
/** The indexes of the all-zero phrase, and ten dates, each giving one Seedshift phrase. */
const ZERO_INDEXES = [...Array<number>(11).fill(0), 3];
const TEN_DATES = "2?-09-2026";

/** Searches whose wallet check answers `matched` and counts how often it was asked. */
function searchesThatMatch(matched: boolean): {
  searches: MnemoCodeSearches;
  checks: () => number;
} {
  let checks = 0;
  const searches = new MnemoCodeSearches({
    checkFor: () => async () => {
      checks += 1;
      return { matched };
    },
  });
  return { searches, checks: () => checks };
}

describe("MnemoCode candidate lists in the Deriver", () => {
  it("writes no list, and says so, for a word search without a valid candidate", async () => {
    const { searches } = searchesThatMatch(false);
    const recipient = (await createSessionIdentity()).recipient;
    const protections: ListProtectionRequest[] = [
      NO_LIST,
      SYNTHETIC_LIST_PASSPHRASE,
      { kind: "key", recipient },
    ];
    for (const list of protections) {
      const outcome = await searches.words(
        { text: NO_VALID_WORDS, kind: "unknown-words", list },
        noProgress,
        signal,
      );
      expect(outcome.count).toBe(0);
      expect(outcome.matched).toBe(0);
      expect(outcome.list).toBeUndefined();
      expect(outcome.listEmpty).toBe(true);
      expect(outcome.listFull).toBe(false);
    }
  });

  it("writes no list for a date search whose candidates match no wallet", async () => {
    const { searches } = searchesThatMatch(false);
    for (const list of [NO_LIST, SYNTHETIC_LIST_PASSPHRASE]) {
      const outcome = ran(
        await searches.dates(
          { indexes: ZERO_INDEXES, mode: "seedshift", dates: TEN_DATES, wallet, list },
          noProgress,
          signal,
        ),
      );
      expect(outcome.count).toBe(10);
      expect(outcome.matched).toBe(0);
      expect(outcome.list).toBeUndefined();
      expect(outcome.listEmpty).toBe(true);
      expect(outcome.listFull).toBe(false);
    }
  });

  it("writes the list of a word search, plain or to the Scanner's key", async () => {
    const { searches } = searchesThatMatch(false);
    const plain = await searches.words(
      { text: ONE_VALID_WORD, kind: "unknown-words", list: NO_LIST },
      noProgress,
      signal,
    );
    expect(plain.count).toBe(1);
    expect(plain.listEmpty).toBe(false);
    expect(plain.list?.records).toBe(1);
    expect(plain.list?.encrypted).toBe(false);
    expect(decodeCandidateList(plain.list!.bytes).records.map((r) => r.entropy)).toEqual([
      ZERO_ENTROPY,
    ]);

    const { identity, recipient } = await createSessionIdentity();
    const keyed = await searches.words(
      { text: ONE_VALID_WORD, kind: "unknown-words", list: { kind: "key", recipient } },
      noProgress,
      signal,
    );
    expect(keyed.list?.encrypted).toBe(true);
    expect(keyed.list?.records).toBe(1);
    const decoded = decodeCandidateList(await decryptCandidates(keyed.list!.bytes, { identity }));
    expect(decoded.records.map((r) => r.entropy)).toEqual([ZERO_ENTROPY]);
    expect(decoded.passphrase).toBeUndefined();
  });

  it("lists every checksum-valid date candidate without a wallet", async () => {
    const { searches } = searchesThatMatch(false);
    const outcome = ran(
      await searches.dates(
        { indexes: ZERO_INDEXES, mode: "seedshift", dates: TEN_DATES, list: NO_LIST },
        noProgress,
        signal,
      ),
    );
    expect(outcome.count).toBe(10);
    expect(outcome.listEmpty).toBe(false);
    expect(outcome.list?.records).toBe(10);
  });

  it("reports no list at all when none was asked for", async () => {
    const { searches } = searchesThatMatch(false);
    for (const text of [NO_VALID_WORDS, ONE_VALID_WORD]) {
      const outcome = await searches.words({ text, kind: "unknown-words" }, noProgress, signal);
      expect(outcome.list).toBeUndefined();
      expect(outcome.listEmpty).toBe(false);
      expect(outcome.listFull).toBe(false);
    }
    const dates = ran(
      await searches.dates(
        { indexes: ZERO_INDEXES, mode: "seedshift", dates: TEN_DATES, wallet },
        noProgress,
        signal,
      ),
    );
    expect(dates.list).toBeUndefined();
    expect(dates.listEmpty).toBe(false);
  });

  describe("refuses a BIP39 passphrase that no list can store before any wallet check", () => {
    const refusals: [string, string, RegExp][] = [
      ["257 ASCII bytes", "x".repeat(257), /longer than 256 bytes/u],
      // 129 characters, but 258 UTF-8 bytes: the limit counts bytes.
      ["258 bytes in 129 characters", "é".repeat(129), /longer than 256 bytes/u],
      ["a lone surrogate", "abc\uD800", /not valid Unicode text/u],
    ];
    for (const [name, listPassphrase, refusal] of refusals) {
      it(`${name}, in a word and a date search`, async () => {
        const { searches, checks } = searchesThatMatch(true);
        await expect(
          searches.words(
            { text: ONE_VALID_WORD, kind: "unknown-words", wallet, list: NO_LIST, listPassphrase },
            noProgress,
            signal,
          ),
        ).rejects.toThrow(refusal);
        await expect(
          searches.dates(
            {
              indexes: ZERO_INDEXES,
              mode: "seedshift",
              dates: TEN_DATES,
              wallet,
              list: NO_LIST,
              listPassphrase,
            },
            noProgress,
            signal,
          ),
        ).rejects.toThrow(refusal);
        expect(checks()).toBe(0);
      });
    }

    it("the wallet's passphrase when the list stores it", async () => {
      const { searches, checks } = searchesThatMatch(true);
      await expect(
        searches.words(
          {
            text: ONE_VALID_WORD,
            kind: "unknown-words",
            wallet: { ...wallet, passphrase: "x".repeat(257) },
            list: NO_LIST,
          },
          noProgress,
          signal,
        ),
      ).rejects.toThrow(/BIP39 passphrase that the list stores is longer than 256 bytes/u);
      expect(checks()).toBe(0);
    });

    it("and refuses a bad list protection before the search too", async () => {
      const { searches, checks } = searchesThatMatch(true);
      const refusals: [ListProtectionRequest, RegExp][] = [
        [{ kind: "key", recipient: "age1bad" }, /starts with age1/u],
        [{ kind: "passphrase", passphrase: "short" }, /at least 12 characters/u],
      ];
      for (const [list, refusal] of refusals) {
        await expect(
          searches.words(
            { text: ONE_VALID_WORD, kind: "unknown-words", wallet, list },
            noProgress,
            signal,
          ),
        ).rejects.toThrow(refusal);
      }
      expect(checks()).toBe(0);
    });
  });

  it("stores a passphrase of exactly 256 bytes", async () => {
    const { searches } = searchesThatMatch(false);
    for (const listPassphrase of ["x".repeat(256), "é".repeat(128)]) {
      const outcome = await searches.words(
        { text: ONE_VALID_WORD, kind: "unknown-words", list: NO_LIST, listPassphrase },
        noProgress,
        signal,
      );
      expect(outcome.list?.records).toBe(1);
      expect(decodeCandidateList(outcome.list!.bytes).passphrase).toBe(listPassphrase);
    }
  });

  it("checks a long wallet passphrase without a list, which BIP39 allows", async () => {
    const { searches, checks } = searchesThatMatch(true);
    const outcome = await searches.words(
      {
        text: ONE_VALID_WORD,
        kind: "unknown-words",
        wallet: { ...wallet, passphrase: "x".repeat(257) },
      },
      noProgress,
      signal,
    );
    expect(checks()).toBe(1);
    expect(outcome.count).toBe(1);
    expect(outcome.list).toBeUndefined();
  });

  it("wipes the entropies it wrote and refuses more than one list holds", async () => {
    const writer = new CandidateListWriter(NO_LIST, "");
    const entropies = [new Uint8Array(16).fill(7)];
    const written = await writer.write(entropies);
    expect(written.list?.records).toBe(1);
    expect(entropies[0]).toEqual(new Uint8Array(16));
    // A sparse array: only its length matters, since too many are refused before any is read.
    const tooMany = await writer.writePhrases(new Array<string>(CandidateListWriter.KEEP));
    expect(tooMany).toEqual({ listFull: true, listEmpty: false });
  });
});

describe("a date search asks first only when it takes longer than MnemoCode starts unasked", () => {
  /** Searches whose wallet check takes `milliseconds`, so that the pace makes a search long. */
  function searchesWithCheckOf(milliseconds: number): MnemoCodeSearches {
    return new MnemoCodeSearches({
      checkFor: () => async () => {
        await new Promise((done) => setTimeout(done, milliseconds));
        return { matched: false };
      },
    });
  }
  // 365 days of 2026 times the 3,653 days of 2020 to 2029: 1,333,345 combinations; at 50 ms a check
  // that is about 19 hours, more than the 12 that start unasked.
  const MANY_DATES = "??-??-2026 ??-??-202?";

  it("asks before a search timed at more than 12 hours, and names its size and time", async () => {
    const outcome = await searchesWithCheckOf(50).dates(
      { indexes: ZERO_INDEXES, mode: "seedshift", dates: MANY_DATES, wallet },
      noProgress,
      signal,
    );
    expect(outcome).toEqual({
      question: expect.stringMatching(/^Search 1,333,345 date combinations, about \d+ hours\?$/u),
    });
  });

  it("starts a short search at once, without a question", async () => {
    const progress: SearchProgress[] = [];
    const outcome = ran(
      await searchesWithCheckOf(0).dates(
        { indexes: ZERO_INDEXES, mode: "seedshift", dates: TEN_DATES, wallet },
        (report) => progress.push(report),
        signal,
      ),
    );
    expect(outcome.count).toBe(10);
    // Ten dates take far less than a minute, so no time is said with the progress.
    expect(progress[0]).toEqual({ checked: 0, total: 10, found: 0, matched: 0 });
  });
});

describe("how many candidates a search shows, as MnemoCode's command line (AUD-023-FUN001)", () => {
  it("shows every word candidate, as recover-word, which has no --max-results", async () => {
    const { searches } = searchesThatMatch(false);
    // The last word of twelve forgotten: 2^7 words complete the checksum.
    const outcome = await searches.words(
      { text: `${"abandon ".repeat(11)}?`, kind: "unknown-words" },
      noProgress,
      signal,
    );
    expect(outcome.count).toBe(128);
    expect(outcome.shown).toHaveLength(128);
  });

  it("caps date display without limiting the searched candidates", async () => {
    const { searches } = searchesThatMatch(false);
    const dates = (maxShown: number) =>
      searches.dates(
        { indexes: ZERO_INDEXES, mode: "seedshift", dates: TEN_DATES, maxShown },
        noProgress,
        signal,
      );
    const outcome = ran(await dates(3));
    expect(outcome.count).toBe(10);
    expect(outcome.shown).toHaveLength(3);
    for (const refused of [0, -1, 1.5, Number.NaN])
      await expect(dates(refused)).rejects.toThrow(
        `maxShown must be an integer from ${MnemoCodeSearchSettings.countRange.min} through ${MnemoCodeSearchSettings.countRange.max}.`,
      );
  });
});

describe("codes marked with ? in Decode, by MnemoCode's MissingCodesSearch", () => {
  const PHRASE = `${"abandon ".repeat(11)}about`;
  /** The public phrase's master fingerprint with an empty passphrase (BIP32 test vectors). */
  const FINGERPRINT = "73c5da0a";
  const fingerprintOf = (phrase: string): string =>
    HDKey.fromMasterSeed(mnemonicToSeedSync(phrase)).fingerprint.toString(16).padStart(8, "0");
  const byFingerprint = {
    checkFor:
      ({ evidence }: { evidence: { value: string } }) =>
      async (phrase: string) => ({ matched: fingerprintOf(phrase) === evidence.value }),
  };

  it("finds the one set of codes that gives the wallet", async () => {
    const searches = new MnemoCodeSearches(byFingerprint as never, fingerprintOf);
    const outcome = await searches.missingCodes(
      {
        text: `${"1 ".repeat(11)}?`,
        format: "indexes",
        mode: "direct",
        way: "wallet",
        wallet: {
          evidence: { kind: "master-fingerprint", value: FINGERPRINT, network: "mainnet" },
          passphrase: "",
        },
      },
      noProgress,
      signal,
    );
    expect(outcome).toEqual({ kind: "found", places: "Code 12", codes: `${"1 ".repeat(11)}4` });
  });

  it("lists the few candidates with their fingerprints, and refuses a list of many", async () => {
    const searches = new MnemoCodeSearches(byFingerprint as never, fingerprintOf);
    const outcome = await searches.missingCodes(
      { text: `${"abandon ".repeat(11)}ab*`, format: "english", mode: "direct", way: "list" },
      noProgress,
      signal,
    );
    expect("kind" in outcome && outcome.kind).toBe("list");
    if (!("kind" in outcome) || outcome.kind !== "list") return;
    expect(outcome.rows).toContainEqual({
      codes: PHRASE,
      phrase: PHRASE,
      fingerprint: FINGERPRINT,
    });
    await expect(
      searches.missingCodes(
        { text: `${"1 ".repeat(11)}?`, format: "indexes", mode: "direct", way: "list" },
        noProgress,
        signal,
      ),
    ).rejects.toThrow(/A list holds at most 16 candidates/u);
  });

  it("stops after the first fingerprint when a listed-code search is cancelled", async () => {
    const controller = new AbortController();
    const stop = new Error("public listed-code cancellation");
    let calls = 0;
    const searches = new MnemoCodeSearches(byFingerprint as never, async () => {
      calls += 1;
      controller.abort(stop);
      return "00000000";
    });
    await expect(
      searches.missingCodes(
        { text: `${"abandon ".repeat(23)}?`, format: "english", mode: "direct", way: "list" },
        noProgress,
        controller.signal,
      ),
    ).rejects.toBe(stop);
    expect(calls).toBe(1);
  });
});
