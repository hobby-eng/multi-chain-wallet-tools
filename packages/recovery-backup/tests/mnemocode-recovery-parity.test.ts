// Source-only handoff: no KDF, browser or large candidate space is needed by these regressions.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeCandidateList } from "../../recovery-mnemocode/source/core/candidate-list.js";
import { EncodedForm } from "../../recovery-mnemocode/source/core/encoded-form.js";
import {
  DateSearch,
  HARD_MAX_COMBINATIONS,
} from "../../recovery-mnemocode/source/core/date-search.js";
import {
  MissingCodesSearch,
  type MissingCodesRun,
} from "../../recovery-mnemocode/source/core/missing-codes-search.js";
import { SearchPlan } from "../../recovery-mnemocode/source/core/search-plan.js";
import { FINGERPRINT_WARNING } from "../../recovery-mnemocode/source/core/wallet-check.js";
import { recoverMnemoCodeLegacyLastWords } from "../src/mnemocode.js";
import {
  CandidateListWriter,
  MnemoCodeSearches,
  MnemoCodeSearchSettings,
  type SearchOutcome,
  type SearchProgress,
  type SearchQuestion,
} from "../src/mnemocode-search.js";

// Public fixtures already used by mnemocode.test.ts and mnemocode-search.test.ts.
const ZERO_INDEXES = [...Array<number>(11).fill(0), 3];
// Internal indexes are zero-based; the form writes the actual human word numbers.
const MARKED_INDEX_CODES = `${EncodedForm.of("indexes").codes(ZERO_INDEXES.slice(0, -1))} ?`;
const TEN_DATES = "2?-09-2026";
const LEGACY = "mosquito dust hotel maximum rich kitten hair mother salute dream flush hospital";
const wallet = {
  evidence: { kind: "master-fingerprint" as const, value: "00000000", network: "mainnet" as const },
  passphrase: "",
};
const noProgress = (): void => undefined;
const signal = new AbortController().signal;

function ran(outcome: SearchOutcome | SearchQuestion): SearchOutcome {
  if ("question" in outcome) throw new Error("A confirmed synthetic search must run.");
  return outcome;
}

describe("MnemoCode recovery settings admission", () => {
  it("keeps omitted controls absent and reads decimal counts through the shared reader", () => {
    const absent = MnemoCodeSearchSettings.parse("dates", {
      maxCandidates: " ",
      maxShown: "",
      progressEvery: "",
    });
    expect(absent.request).toEqual({});
    expect(absent.maxShown).toBe(MnemoCodeSearchSettings.defaultMaxShown);
    expect(
      MnemoCodeSearchSettings.parse("dates", {
        maxCandidates: "0009",
        maxShown: "2049",
        progressEvery: "3",
      }).request,
    ).toEqual({ maxCandidates: 9, maxShown: 2049, progressEvery: 3 });
  });

  it.each(["0", "1.5", "1e3", "-1", String(Number.MAX_SAFE_INTEGER + 1)])(
    "refuses invalid typed count %s",
    (value) => {
      for (const field of ["maxCandidates", "maxShown", "progressEvery"] as const)
        expect(() => MnemoCodeSearchSettings.parse("dates", { [field]: value })).toThrow();
    },
  );

  it.each([2049, Number.MAX_SAFE_INTEGER])(
    "admits display and progress count %s without allocating retained results",
    (count) => {
      const settings = MnemoCodeSearchSettings.parse("dates", {
        maxShown: String(count),
        progressEvery: String(count),
      });
      expect(settings.request).toEqual({ maxShown: count, progressEvery: count });
      expect(settings.maxShown).toBe(count);
    },
  );

  it("retains the core consent bound and rejects unsupported request combinations", () => {
    expect(
      MnemoCodeSearchSettings.of("missing-codes", { maxCandidates: HARD_MAX_COMBINATIONS }).request,
    ).toEqual({ maxCandidates: HARD_MAX_COMBINATIONS });
    expect(() =>
      MnemoCodeSearchSettings.of("dates", { maxCandidates: HARD_MAX_COMBINATIONS + 1 }),
    ).toThrow();
    for (const kind of ["missing-codes", "words"] as const)
      for (const settings of [{ maxShown: 3 }, { progressEvery: 3 }])
        expect(() => MnemoCodeSearchSettings.of(kind, settings)).toThrow(/date search/u);
    expect(() => MnemoCodeSearchSettings.of("words", { maxCandidates: 3 })).toThrow(/word search/u);
    expect(() => MnemoCodeSearchSettings.of("dates", { maxTries: 3 })).toThrow(/share recovery/u);
    expect(() => MnemoCodeSearchSettings.of("dates", { keep: 3 })).toThrow(/requested list/u);
  });
});

describe("MnemoCode date consent, progress and retention", () => {
  beforeEach(() => {
    // Deterministic planning without timing a fingerprint or any wallet derivation.
    vi.spyOn(DateSearch.prototype, "pace").mockResolvedValue({ perCheck: 0, perCombination: 0 });
  });
  afterEach(() => vi.restoreAllMocks());

  it("asks below assessed work, then searches all ten dates after explicit confirmation", async () => {
    let checks = 0;
    const searches = new MnemoCodeSearches({
      checkFor: () => () => {
        checks += 1;
        return { matched: true };
      },
    });
    const request = {
      indexes: ZERO_INDEXES,
      mode: "seedshift" as const,
      dates: TEN_DATES,
      wallet,
      maxCandidates: 1,
      maxShown: 2,
      progressEvery: 3,
      list: { kind: "none" as const },
    };
    const run = vi.spyOn(DateSearch.prototype, "run");
    const plan = vi.spyOn(DateSearch.prototype, "plan");
    const progress: SearchProgress[] = [];
    expect(await searches.dates(request, noProgress, signal)).toHaveProperty("question");
    expect(run).not.toHaveBeenCalled();
    expect(checks).toBe(0);
    const outcome = ran(
      await searches.dates({ ...request, confirmed: true }, (p) => progress.push(p), signal),
    );
    expect(plan).toHaveBeenLastCalledWith({ perCheck: 0, perCombination: 0 }, 1);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ progressEvery: 3, signal }));
    expect(checks).toBe(10);
    expect(outcome.count).toBe(10);
    expect(outcome.matched).toBe(10);
    expect(outcome.shown).toHaveLength(2);
    expect(outcome.list?.records).toBe(10);
    expect(decodeCandidateList(outcome.list!.bytes).records).toHaveLength(10);
    expect(progress.map((p) => p.checked)).toEqual([0, 3, 6, 9, 10]);
  });

  it("accepts a display count above the former page cap without inventing a progress default", async () => {
    const searches = new MnemoCodeSearches({ checkFor: () => () => ({ matched: true }) });
    const run = vi.spyOn(DateSearch.prototype, "run");
    const outcome = ran(
      await searches.dates(
        { indexes: ZERO_INDEXES, mode: "seedshift", dates: TEN_DATES, wallet, maxShown: 2049 },
        noProgress,
        signal,
      ),
    );
    expect(outcome.count).toBe(10);
    expect(outcome.shown).toHaveLength(10);
    expect(run.mock.calls[0]![0]).not.toHaveProperty("progressEvery");
  });

  it("requires incomplete dates before standalone planning", async () => {
    const searches = new MnemoCodeSearches({ checkFor: () => () => ({ matched: true }) });
    const run = vi.spyOn(DateSearch.prototype, "run");
    await expect(
      searches.dates(
        { indexes: ZERO_INDEXES, mode: "seedshift", dates: "23-09-2026", wallet },
        noProgress,
        signal,
      ),
    ).rejects.toThrow("At least one date must contain a forgotten digit represented by ?.");
    expect(DateSearch.prototype.pace).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("checks cancellation after planning and after the awaited list writer", async () => {
    const searches = new MnemoCodeSearches({ checkFor: () => () => ({ matched: false }) });
    const request = { indexes: ZERO_INDEXES, mode: "seedshift" as const, dates: TEN_DATES, wallet };
    const planning = new AbortController();
    const stopped = new Error("Synthetic stop.");
    vi.mocked(DateSearch.prototype.pace).mockImplementationOnce(async () => {
      planning.abort(stopped);
      return { perCheck: 0, perCombination: 0 };
    });
    const run = vi.spyOn(DateSearch.prototype, "run");
    await expect(searches.dates(request, noProgress, planning.signal)).rejects.toBe(stopped);
    expect(run).not.toHaveBeenCalled();

    const writing = new AbortController();
    const bytes = new Uint8Array([1, 2, 3]);
    vi.spyOn(CandidateListWriter.prototype, "writePhrases").mockImplementationOnce(async () => {
      writing.abort(stopped);
      return {
        list: { bytes, description: "Synthetic list", encrypted: false, records: 10 },
        listFull: false,
        listEmpty: false,
      };
    });
    await expect(
      searches.dates({ ...request, list: { kind: "none" } }, noProgress, writing.signal),
    ).rejects.toBe(stopped);
    expect(bytes).toEqual(new Uint8Array(3));
  });
});

describe("MnemoCode marked-code consent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("still admits complete dates for joint marked-code wallet recovery", async () => {
    const prepared = vi
      .spyOn(MissingCodesSearch.prototype, "byWallet")
      .mockImplementation((_check, dates) => {
        expect(dates?.hasForgottenDigits).toBe(false);
        expect(dates?.known).toEqual([{ year: 2026, month: 9, day: 23 }]);
        return {
          plan: async () => SearchPlan.of("synthetic combined work", 1, 0),
          run: async () => ({ kind: "none" as const, message: "Synthetic no match." }),
        };
      });
    const searches = new MnemoCodeSearches(
      { checkFor: () => () => ({ matched: false }) },
      () => "00000000",
    );
    await searches.missingCodes(
      {
        text: MARKED_INDEX_CODES,
        format: "indexes",
        mode: "seedshift",
        way: "wallet",
        dates: "23-09-2026",
        wallet,
      },
      noProgress,
      signal,
    );
    expect(prepared).toHaveBeenCalledOnce();
  });

  it("passes allowance to the production way and never uses it as a run cutoff", async () => {
    const plan = vi.fn(async (limit?: number) => SearchPlan.of("synthetic extent", 128, 0, limit));
    const run = vi.fn(async (_run?: MissingCodesRun) => ({
      kind: "none" as const,
      message: "Synthetic no match.",
    }));
    vi.spyOn(MissingCodesSearch.prototype, "byEncodedFingerprint").mockReturnValue({ plan, run });
    const searches = new MnemoCodeSearches(
      { checkFor: () => () => ({ matched: false }) },
      () => "00000000",
    );
    const request = {
      text: MARKED_INDEX_CODES,
      format: "indexes" as const,
      mode: "direct" as const,
      way: "encoded" as const,
      encodedFingerprint: "00000000",
      maxCandidates: 1,
    };
    expect(await searches.missingCodes(request, noProgress, signal)).toHaveProperty("question");
    expect(run).not.toHaveBeenCalled();
    await searches.missingCodes({ ...request, confirmed: true }, noProgress, signal);
    expect(plan).toHaveBeenLastCalledWith(1);
    expect(run.mock.calls[0]).toEqual([expect.objectContaining({ signal })]);
    expect(run.mock.calls[0]![0]).not.toHaveProperty("maxCandidates");
    await expect(
      searches.missingCodes({ ...request, way: "list" }, noProgress, signal),
    ).rejects.toThrow(/bounded list/u);
  });
});

describe("MnemoCode legacy stored replacement wallet comparison", () => {
  it("compares every replacement, retaining the preserved row, match path and warning", async () => {
    const candidates = recoverMnemoCodeLegacyLastWords(LEGACY);
    const preserved = candidates.find((candidate) => candidate.preservesLegacyEntropy)!;
    const checked: string[] = [];
    const searches = new MnemoCodeSearches({
      checkFor: () => async (phrase) => {
        checked.push(phrase);
        return { matched: phrase === preserved.mnemonic, path: "m", warning: FINGERPRINT_WARNING };
      },
    });
    const outcome = await searches.words(
      { text: LEGACY, kind: "legacy-replacements", wallet },
      noProgress,
      signal,
    );
    expect(checked).toEqual(candidates.map((candidate) => candidate.mnemonic));
    expect(outcome.count).toBe(128);
    expect(outcome.matched).toBe(1);
    expect(outcome.warning).toBe(FINGERPRINT_WARNING);
    expect(outcome.shown.find((candidate) => candidate.matched)).toMatchObject({
      phrase: preserved.mnemonic,
      path: "m",
      found: expect.stringContaining("preserved"),
    });
    expect(outcome.list).toBeUndefined();
  });

  it("refuses a candidate file and never publishes after an awaited wallet check is cancelled", async () => {
    const controller = new AbortController();
    const stopped = new Error("Synthetic wallet stop.");
    const check = vi.fn(async () => {
      controller.abort(stopped);
      return { matched: true };
    });
    const searches = new MnemoCodeSearches({ checkFor: () => check });
    await expect(
      searches.words(
        { text: LEGACY, kind: "legacy-replacements", wallet, list: { kind: "none" } },
        noProgress,
        signal,
      ),
    ).rejects.toThrow(/no candidate list/u);
    expect(check).not.toHaveBeenCalled();
    const progress = vi.fn();
    await expect(
      searches.words(
        { text: LEGACY, kind: "legacy-replacements", wallet },
        progress,
        controller.signal,
      ),
    ).rejects.toBe(stopped);
    expect(check).toHaveBeenCalledTimes(1);
    expect(progress).not.toHaveBeenCalled();
  });
});
