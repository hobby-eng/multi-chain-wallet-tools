import { describe as group, expect, it } from "vitest";
import type { MhfeCandidate, MhfeSealed } from "@ckd/recovery-mhfe-wasm/core/client.js";
import type { MhfePasswordReview } from "@ckd/recovery-mhfe-wasm/passwords/passwords.js";
import { MhfeError } from "@ckd/recovery-mhfe-wasm/runtime/runtime.js";
import {
  CHECK_STAGES,
  ENCRYPT_STAGES,
  REKEY_STAGES,
  StageProgress,
  candidateSummary,
  clearOnFirstProgress,
  describe,
  drawLine,
  drawOutlook,
  drawStartLine,
  keepLine,
  listed,
  readBackDiffers,
  reviewAnswers,
  reviewNeedsChoice,
  reviewOutcome,
  sealedNotes,
  timeRange,
  walletCheckOdds,
} from "../src/ui/recovery-mhfe-status.js";
import { JobClock } from "../src/ui/recovery-progress.js";

const FULL_SUITE_ID = "MHFE-BIP39-256-EXPERIMENTAL-3";
/** Rounds of one pass through the cipher, as the package's parameters() give them. */
const STAGE_ROUNDS = 12;

function sealed(overrides: Partial<MhfeSealed>): MhfeSealed {
  return {
    container: "public test container",
    suiteId: FULL_SUITE_ID,
    containerFingerprint: "00000000",
    builtInCheck: true,
    otherLengths: [],
    repairWords: null,
    repairProfile: null,
    keep: [{ item: "containerWords", words: 24 }, { item: "password" }],
    ...overrides,
  };
}

function candidate(status: MhfeCandidate["status"], words: MhfeCandidate["words"]): MhfeCandidate {
  return {
    words,
    verified: status === "verified",
    status,
    phrase: "public test phrase",
    suiteId: FULL_SUITE_ID,
    fingerprintWithoutPassphrase: "73c5da0a",
    walletCheck: null,
    statedWords: null,
    otherLengths: [],
  };
}

function review(overrides: Partial<MhfePasswordReview>): MhfePasswordReview {
  return {
    profile: "MHFE-PASSWORD-CHECK-1",
    reading: "notThisShape",
    correction: null,
    correctionText: null,
    offersCorrection: false,
    repairsFirst: false,
    repairs: [],
    ...overrides,
  };
}

group("MHFE panel texts", () => {
  it("empties the password fields once, when the operation reports its first progress", () => {
    const password = { value: "public test password" } as HTMLInputElement;
    const repeat = { value: "public test password" } as HTMLInputElement;
    const clear = clearOnFirstProgress(password, repeat);
    expect(password.value).toBe("public test password");
    clear();
    expect([password.value, repeat.value]).toEqual(["", ""]);
    password.value = "typed again";
    clear();
    expect(password.value).toBe("typed again");
  });

  it("says that an error in the page stopped the operation, and uses the tool's texts", () => {
    const cause = new Error("progress element missing");
    // The error as the package gives it: its constructor stores the page's error as `cause`.
    const error = new MhfeError("CALLBACK_FAILED", "callback failed", { cause });
    expect(describe(error, "fallback")).toContain(
      "Stopped because this page failed to show the progress (progress element missing)",
    );
    expect(describe(new MhfeError("CANCELLED", "x"), "fallback")).toContain("Stopped.");
    // The library's sentence, with the page's next step as `mhfe` adds one to a refused answer.
    expect(
      describe(
        new MhfeError("PASSWORDS_DIFFER", "The password and its repetition differ"),
        "fallback",
      ),
    ).toBe("The password and its repetition differ. Please type them again.");
    expect(describe(new MhfeError("EMPTY_PASSWORD", "The password is empty"), "fallback")).toBe(
      "The password is empty.",
    );
    // A message that ends a sentence already keeps its own full stop.
    expect(describe(new MhfeError("BUSY", "Another operation is still running."), "x")).toBe(
      "Another operation is still running. Wait for it, or press Cancel where it runs.",
    );
  });

  it("joins a list and gives a time as the command-line tool does", () => {
    expect(listed([])).toBe("");
    expect(listed([3])).toBe("3");
    expect(listed([3, 17])).toBe("3 and 17");
    expect(listed(["a", "b", "c"])).toBe("a, b, and c");
    expect(timeRange(60, 120)).toBe("1 to 2 minutes");
    expect(walletCheckOdds(16)).toBe("65,536");
  });

  it("counts the rounds of each stage on its own and names the stage", () => {
    let now = 0;
    const clock = new JobClock(() => now);
    const encrypt = new StageProgress(ENCRYPT_STAGES, STAGE_ROUNDS, clock);
    expect(encrypt.line({ stage: "encrypt", round: 1, rounds: 24 })).toBe(
      "Encrypting · round 1 of 12 · 0 s elapsed",
    );
    now = 66_000;
    // Eleven rounds took 66 s, so the 13 still to come take about 78 s.
    expect(encrypt.line({ stage: "encrypt", round: 12, rounds: 24 })).toBe(
      "Encrypting · round 12 of 12 · 1 min 6 s elapsed · about 1 min 18 s left",
    );
    expect(encrypt.line({ stage: "check", round: 13, rounds: 24 })).toMatch(
      /^Checking the container · round 1 of 12 · /u,
    );
    expect(encrypt.elapsed()).toBe("1 min 6 s");
    expect(
      new StageProgress(REKEY_STAGES, STAGE_ROUNDS, clock).line({
        stage: "encrypt",
        round: 25,
        rounds: 36,
      }),
    ).toMatch(/^Encrypting the new container · round 1 of 12 · /u);
    expect(
      new StageProgress(CHECK_STAGES, STAGE_ROUNDS, clock).line({
        stage: "compare",
        round: 12,
        rounds: 12,
      }),
    ).toBe("Comparing with your wallet · 1 min 6 s elapsed");
    expect(drawLine(65_536, clock, true)).toBe(
      "Drawing a phrase that passes the check · 65,536 tried · 1 min 6 s elapsed",
    );
    expect(drawLine(170, clock, false)).toBe(
      "Drawing a phrase that meets your words · 170 tried · 1 min 6 s elapsed",
    );
  });

  it("starts a draw with the draws MHFE expects", () => {
    expect(drawStartLine(true, 65_536)).toBe(
      "Drawing a phrase that passes the check, about 65,536 draws.",
    );
    expect(drawStartLine(false, 170.6)).toBe(
      "Drawing a phrase that meets your words, about 171 draws.",
    );
    // Neither the check nor a chosen word: the first phrase drawn is taken.
    expect(drawStartLine(false, 1)).toBe("Drawing a new phrase.");
  });

  it("states what a new phrase keeps as MHFE rates it, in the words of mhfe new", () => {
    // The values of MhfeWallet.parameters() that the statements name.
    const parameters = {
      version: "0.6.0",
      coins: [],
      walletCheckBits: 16,
      drawReportInterval: 64,
      maxChosenWords: 1,
      maxNeverUseWords: 1,
      recommendedRandomBits: 240,
    };
    const odds = (
      randomBits: number,
      randomness: "full" | "ample" | "notRecommended",
      fixedPosition = true,
    ) => ({
      randomBits,
      randomness,
      expectedDraws: 1,
      recognisable: false,
      fixedPosition,
    });
    expect(drawOutlook(odds(256, "full"), parameters)).toBeNull();
    expect(drawOutlook(odds(240, "ample"), parameters)).toBe(
      "The phrase keeps about 240 of its 256 random bits: still far more than enough.",
    );
    expect(drawOutlook(odds(228.98, "notRecommended"), parameters)).toBe(
      "Not recommended: the phrase keeps about 228 of its 256 random bits, fewer than 240. A word " +
        "anywhere in the phrase keeps more than one at a fixed position.",
    );
    // A word asked for anywhere already keeps more: no such advice.
    expect(drawOutlook(odds(228.98, "notRecommended", false), parameters)).toBe(
      "Not recommended: the phrase keeps about 228 of its 256 random bits, fewer than 240.",
    );
  });

  it("says what to keep from the package's list", () => {
    expect(keepLine(sealed({}).keep)).toBe(
      "Nothing else needs to be kept: the 24 words and the password are enough.",
    );
    expect(
      keepLine([
        { item: "containerWords", words: 24 },
        { item: "password" },
        { item: "repairWords" },
        { item: "passphrase" },
        { item: "pim", value: 3 },
      ]),
    ).toBe(
      "Keep: the 24 words, the password, the repair words apart from the container phrase, the BIP39 passphrase, and PIM 3.",
    );
  });

  it("names any BIP39 passphrase of the wallet where the page did not ask (mhfe encrypt's words)", () => {
    expect(
      keepLine([
        { item: "containerWords", words: 24 },
        { item: "password" },
        { item: "passphraseIfAny" },
      ]),
    ).toBe("Keep: the 24 words, the password, and any BIP39 passphrase of the wallet.");
    expect(
      keepLine([
        { item: "containerWords", words: 24 },
        { item: "password" },
        { item: "passphraseIfAny" },
        { item: "repairWords" },
      ]),
    ).toBe(
      "Keep: the 24 words, the password, any BIP39 passphrase of the wallet, and the repair words apart from the container phrase.",
    );
  });

  it("names the wallet's BIP39 passphrase whenever the package lists it", () => {
    // A rekey of a wallet with a passphrase, new PIM 0, with and without repair words (AUD-022-API004).
    const withoutRepairWords = keepLine([
      { item: "containerWords", words: 24 },
      { item: "password" },
      { item: "passphrase" },
    ]);
    expect(withoutRepairWords).toBe("Keep: the 24 words, the password, and the BIP39 passphrase.");
    expect(withoutRepairWords).not.toContain("Nothing else needs to be kept");
    expect(
      keepLine([
        { item: "containerWords", words: 24 },
        { item: "password" },
        { item: "repairWords" },
        { item: "passphrase" },
      ]),
    ).toBe(
      "Keep: the 24 words, the password, the repair words apart from the container phrase, and the BIP39 passphrase.",
    );
  });

  it("explains a container without a built-in check, a PIM and a word count", () => {
    const same = sealedNotes(sealed({ builtInCheck: false }), true).join(" ");
    expect(same).toContain("This container has no built-in check");
    // The word count to note comes from the package's list of what to keep.
    const full = sealedNotes(
      sealed({
        builtInCheck: false,
        otherLengths: [21],
        keep: [
          { item: "containerWords", words: 24 },
          { item: "pim", value: 2 },
          { item: "wordCount", words: 12 },
        ],
      }),
      false,
    ).join(" ");
    expect(full).toContain("PIM 2");
    expect(full).toContain("your phrase has 12 words");
    expect(full).toContain("A 24-word phrase has no built-in check");
    expect(full).toContain("not from the screen");
  });

  it("gives every status of a recovered phrase its verdict", () => {
    expect(candidateSummary(candidate("verified", 12))).toMatchObject({ verified: true });
    expect(candidateSummary(candidate("noBuiltInCheck", 12)).text).toMatch(
      /^Not verified: this container keeps/u,
    );
    expect(candidateSummary(candidate("readAs24", 24)).text).toContain("no shorter length passed");
    expect(candidateSummary(candidate("readAs24Chosen", 24)).text).toContain("as selected");
  });

  it("asks about a check word only when the review needs an answer", () => {
    expect(reviewNeedsChoice(review({}))).toBe(false);
    expect(reviewNeedsChoice(review({ reading: "fits" }))).toBe(false);
    expect(reviewNeedsChoice(review({ reading: "fits", correction: "capitals" }))).toBe(true);
    expect(reviewNeedsChoice(review({ reading: "restorable" }))).toBe(true);
  });

  it("orders the answers of a review as the package says, the password as typed among them", () => {
    const restorable = review({
      reading: "restorable",
      repairsFirst: true,
      repairs: [{ position: 3, word: "abandon", typed: null }],
    });
    const answers = reviewAnswers(restorable);
    expect(answers.map((answer) => answer.label)).toEqual([
      "Word 3: abandon",
      "Use the password as typed",
      "Type the password again",
    ]);
    expect(answers[0]?.repair).toEqual({ repair: 3 });
    expect(reviewOutcome(restorable, { repair: 3 })).toBe(
      "Password: word 3 repaired by its check word.",
    );
    const corrected = review({
      reading: "fits",
      correction: "extraSpaces",
      correctionText: "public test words",
      offersCorrection: true,
    });
    expect(reviewAnswers(corrected).map((answer) => answer.repair)).toEqual([
      "asTyped",
      "typeAgain",
      "corrected",
    ]);
    expect(reviewOutcome(corrected, "corrected")).toBe(
      "Password: extra spaces removed; its check word fits.",
    );
  });

  it("shows the words read back only when they differ from the entry", () => {
    const read = "abandon ability able about";
    expect(readBackDiffers("  Abandon  ability\nable ABOUT ", read)).toBe(false);
    // Words shortened to their first four letters are written out by the reader.
    expect(readBackDiffers("aban abil able abou", read)).toBe(true);
  });
});
